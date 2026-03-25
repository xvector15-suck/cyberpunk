import os
import json
import base64
import io
import sqlite3
from werkzeug.security import generate_password_hash, check_password_hash
from flask import Flask, request, send_file, jsonify, send_from_directory
from flask_cors import CORS
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from PIL import Image

app = Flask(__name__)
CORS(app)

# ── Configuration ────────────────────────────────
KEY_DIR = ".keys"
PRIVATE_KEY_PATH = os.path.join(KEY_DIR, "private_key.pem")
PUBLIC_KEY_PATH = os.path.join(KEY_DIR, "public_key.pem")
STATIC_DIR = "."

# ── RSA Key Persistence ──────────────────────────
def get_rsa_keys():
    if os.path.exists(PRIVATE_KEY_PATH) and os.path.exists(PUBLIC_KEY_PATH):
        with open(PRIVATE_KEY_PATH, "rb") as f:
            private_key = serialization.load_pem_private_key(f.read(), password=None)
        with open(PUBLIC_KEY_PATH, "rb") as f:
            public_key = serialization.load_pem_public_key(f.read())
        return private_key, public_key
    
    # Generate new pair if not exists
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_key = private_key.public_key()
    
    if not os.path.exists(KEY_DIR):
        os.makedirs(KEY_DIR)
        
    with open(PRIVATE_KEY_PATH, "wb") as f:
        f.write(private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption()
        ))
    with open(PUBLIC_KEY_PATH, "wb") as f:
        f.write(public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        ))
    return private_key, public_key

private_key, public_key = get_rsa_keys()

# ── Steganography (LSB) ──────────────────────────
def encode_message_in_image(image_bytes, message_json):
    """Embeds message JSON into image LSB."""
    img = Image.open(io.BytesIO(image_bytes))
    if img.mode != 'RGB':
        img = img.convert('RGB')
    
    encoded_json = json.dumps(message_json).encode('utf-8')
    # Header: 32 bits for length
    length = len(encoded_json)
    length_bits = format(length, '032b')
    
    # Message bits
    message_bits = "".join(format(b, '08b') for b in encoded_json)
    full_bits = length_bits + message_bits
    
    pixels = list(img.getdata())
    total_pixels = len(pixels)
    if len(full_bits) > total_pixels * 3:
        raise ValueError(f"Image too small. Need {len(full_bits)} bits but only have {total_pixels * 3} available.")
    
    new_pixels = []
    bit_index = 0
    for pixel in pixels:
        new_pixel = list(pixel)
        for i in range(3):
            if bit_index < len(full_bits):
                # Replace LSB
                new_pixel[i] = (pixel[i] & ~1) | int(full_bits[bit_index])
                bit_index += 1
        new_pixels.append(tuple(new_pixel))
        
    new_img = Image.new(img.mode, img.size)
    new_img.putdata(new_pixels)
    
    output = io.BytesIO()
    new_img.save(output, format="PNG")
    return output.getvalue()

def decode_message_from_image(image_bytes):
    """Extracts message JSON from image LSB."""
    img = Image.open(io.BytesIO(image_bytes))
    pixels = list(img.getdata())
    
    bits = ""
    # Extract first 32 bits for length
    for i in range(11): # 11 pixels * 3 = 33 bits
        for channel in pixels[i]:
            bits += str(channel & 1)
            if len(bits) == 32:
                break
        if len(bits) == 32:
            break
            
    length = int(bits, 2)
    total_bits_to_extract = 32 + (length * 8)
    
    bits = ""
    for pixel in pixels:
        for channel in pixel:
            bits += str(channel & 1)
            if len(bits) == total_bits_to_extract:
                break
        if len(bits) == total_bits_to_extract:
            break
            
    message_bits = bits[32:]
    message_bytes = bytearray()
    for i in range(0, len(message_bits), 8):
        message_bytes.append(int(message_bits[i:i+8], 2))
        
    return json.loads(message_bytes.decode('utf-8'))

# ── API Endpoints ────────────────────────────────
@app.route('/api/encrypt', methods=['POST'])
def encrypt_flow():
    try:
        message = request.form.get('message')
        receiver_email = request.form.get('receiver_email')
        image_file = request.files.get('image')
        
        if not message or not receiver_email or not image_file:
            return jsonify({"error": "Missing required fields"}), 400
            
        image_bytes = image_file.read()
        
        # 1. AES Encryption (GCM)
        aes_key = AESGCM.generate_key(bit_length=256)
        aesgcm = AESGCM(aes_key)
        nonce = os.urandom(12)
        encrypted_data = aesgcm.encrypt(nonce, message.encode('utf-8'), None)
        
        # 2. RSA Key Wrap
        encrypted_key = public_key.encrypt(
            aes_key,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA256()),
                algorithm=hashes.SHA256(),
                label=None
            )
        )
        
        # 3. Payload Construction
        payload = {
            "encryptedData": base64.b64encode(encrypted_data).decode('utf-8'),
            "encryptedKey": base64.b64encode(encrypted_key).decode('utf-8'),
            "nonce": base64.b64encode(nonce).decode('utf-8'),
            "authorizedEmail": receiver_email
        }
        
        # 4. Stego Embedding
        stego_image = encode_message_in_image(image_bytes, payload)
        
        return send_file(
            io.BytesIO(stego_image),
            mimetype='image/png',
            as_attachment=True,
            download_name='cyberpunk_secure.png'
        )
        
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/decrypt', methods=['POST'])
def decrypt_flow():
    try:
        email = request.form.get('email')
        password = request.form.get('password')
        image_file = request.files.get('image')
        
        if not email or not password or not image_file:
            return jsonify({"error": "Email, password, and image are required"}), 400

        # 0. Authenticate user against DB
        conn = get_db()
        user = conn.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
        conn.close()

        if not user or not check_password_hash(user['password_hash'], password):
            return jsonify({"error": "Invalid credentials. Login required."}), 401
            
        image_bytes = image_file.read()
        
        # 1. Stego Extraction
        payload = decode_message_from_image(image_bytes)
        
        # 2. Authorization Check
        if payload.get('authorizedEmail') != email:
            return jsonify({"error": "Unauthorized Access Denied"}), 403
            
        # 3. RSA Key Unwrap
        encrypted_key = base64.b64decode(payload['encryptedKey'])
        aes_key = private_key.decrypt(
            encrypted_key,
            padding.OAEP(
                mgf=padding.MGF1(algorithm=hashes.SHA256()),
                algorithm=hashes.SHA256(),
                label=None
            )
        )
        
        # 4. AES Decryption (GCM)
        encrypted_data = base64.b64decode(payload['encryptedData'])
        nonce = base64.b64decode(payload['nonce'])
        aesgcm = AESGCM(aes_key)
        decrypted_message = aesgcm.decrypt(nonce, encrypted_data, None).decode('utf-8')
        
        return jsonify({"message": decrypted_message})
        
    except Exception as e:
        return jsonify({"error": "Failed to decrypt image: " + str(e)}), 500

# ── SQLite Database Setup ────────────────────────
DB_PATH = 'ciphervault.db'

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL
        )
    ''')
    conn.commit()
    conn.close()

init_db()

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# ── Auth Endpoints ───────────────────────────────
@app.route('/api/signup', methods=['POST'])
def signup():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Invalid request"}), 400

        name = data.get('name', '').strip()
        email = data.get('email', '').strip()
        password = data.get('password', '')

        if not name or not email or not password:
            return jsonify({"error": "All fields are required."}), 400
        if len(password) < 4:
            return jsonify({"error": "Password must be at least 4 characters."}), 400

        password_hash = generate_password_hash(password)

        conn = get_db()
        try:
            conn.execute(
                'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)',
                (name, email, password_hash)
            )
            conn.commit()
        except sqlite3.IntegrityError:
            return jsonify({"error": "Email already registered."}), 409
        finally:
            conn.close()

        return jsonify({"success": True, "name": name, "email": email}), 201

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "Invalid request"}), 400

        email = data.get('email', '').strip()
        password = data.get('password', '')

        if not email or not password:
            return jsonify({"error": "All fields are required."}), 400

        conn = get_db()
        user = conn.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
        conn.close()

        if not user or not check_password_hash(user['password_hash'], password):
            return jsonify({"error": "Invalid credentials."}), 401

        return jsonify({"success": True, "name": user['name'], "email": user['email']})

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/check-email', methods=['GET'])
def check_email():
    email = request.args.get('email', '').strip()
    if not email:
        return jsonify({"exists": False}), 400
    conn = get_db()
    user = conn.execute('SELECT id FROM users WHERE email = ?', (email,)).fetchone()
    conn.close()
    return jsonify({"exists": user is not None})

# ── Static File Serving ──────────────────────────
@app.route('/')
def index():
    return send_from_directory(STATIC_DIR, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(STATIC_DIR, path)

if __name__ == '__main__':
    app.run(port=5000, debug=True)
