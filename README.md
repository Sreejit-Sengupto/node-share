# Node Share 🚀

A secure, command-line file sharing tool built with Node.js and TypeScript that enables encrypted file transfers between devices over a network.

## Features ✨

- **🔐 End-to-End Encryption**: Files are encrypted using AES-256-GCM with password-based key derivation
- **📊 Real-time Progress**: Visual progress tracking for both sending and receiving
- **🛡️ Integrity Verification**: Built-in authentication tags to ensure file integrity
- **⚡ Fast Transfer**: Direct TCP socket communication for optimal performance
- **🔑 Password Protection**: Secure transfers with minimum 6-character passwords
- **📱 Cross-Platform**: Works on any system with Node.js

## Installation

### Prerequisites
- Node.js (v14 or higher)
- TypeScript compiler

### Setup
1. Clone the repository:
```bash
git clone <repository-url>
cd node-share
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npx tsc
```

## Usage

The application has two modes: **send** and **receive**.

### Receiving Files

On the receiving device, start the server:
```bash
node build/index.js --receive <sender-ip> <password>
```

Example:
```bash
node build/index.js --receive 192.168.1.100 mypassword123
```

The receiver will:
- Start a server on port 3001
- Wait for incoming connections
- Display progress as files are received

### Sending Files

On the sending device, transfer a file:
```bash
node build/index.js --send <receiver-ip> <file-path> <password>
```

Example:
```bash
node build/index.js --send 192.168.1.200 ./documents/report.pdf mypassword123
```

The sender will:
- Connect to the receiver on port 3001
- Encrypt and transfer the file
- Show transfer progress

## How It Works 🔧

1. **Connection**: Sender connects to receiver via TCP on port 3001
2. **Key Exchange**: Password is used with salt to derive encryption keys using scrypt
3. **Metadata**: File information (name, size, salt, IV) is sent as header
4. **Encryption**: File is encrypted using AES-256-GCM with random IV
5. **Transfer**: Encrypted data is streamed with real-time progress
6. **Verification**: Authentication tag ensures file integrity

## Security 🔒

- **AES-256-GCM Encryption**: Industry-standard authenticated encryption
- **Key Derivation**: Uses scrypt with random salts for key generation
- **Authentication**: Built-in integrity verification with auth tags
- **Random IVs**: Each transfer uses a unique initialization vector

## Network Requirements

- Both devices must be on the same network or have direct connectivity
- Port 3001 must be accessible on the receiving device
- Firewall may need to allow connections on port 3001

## File Structure

```
src/
├── index.ts          # Main entry point and CLI argument parsing
├── send-file.ts      # File sending logic with encryption
├── receive-file.ts   # File receiving logic with decryption
├── progress.ts       # Progress tracking utilities
└── constants.ts      # Application constants
```

## Examples

### Basic Transfer
```bash
# On receiver (192.168.1.200)
node build/index.js --receive 192.168.1.100 secretpass

# On sender (192.168.1.100)
node build/index.js --send 192.168.1.200 ./photo.jpg secretpass
```

### Large File Transfer
```bash
# Transfer a large video file
node build/index.js --send 192.168.1.200 ./videos/movie.mp4 strongpassword123
```

## Error Handling

The application handles various error conditions:
- **Wrong Password**: File transfer fails with integrity verification error
- **Network Issues**: Connection errors are displayed with helpful messages
- **File Not Found**: Clear error message when source file doesn't exist
- **Invalid Arguments**: Validation for required parameters and password length

## Development

### Building
```bash
npx tsc
```

### Project Structure
- TypeScript source files in `src/`
- Compiled JavaScript output in `build/`
- Configured for CommonJS modules with ES2016 target

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is open source and available under the [MIT License](LICENSE).

---

**⚠️ Security Note**: This tool is designed for local network file transfers. Always use strong passwords and ensure you trust the network you're transferring files over.