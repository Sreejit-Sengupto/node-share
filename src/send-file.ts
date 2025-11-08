import net from 'net'
import fs from 'fs'
import crypto from 'crypto'
import { PORT } from './constants'
import { trackProgress } from './progress'

// Sending algo -
// First form the header: SALT, IV, File name and size
// Calculate the length of the header
// Create a 4 bytes buffer -> store the length in it and send it using Big Endian
// Send the header
// Create pipes -> encrypt, read-stream, progress

export const sendFile = (host: string, port: string, filepath: string, filename: string, filesize: number, password: string) => {
    const client = net.connect(parseInt(port), host, () => {
        console.log(`Connected to ${host} on PORT:${PORT}`);

        const salt = crypto.randomBytes(16);
        const iv = crypto.randomBytes(12);
        const key = crypto.scryptSync(password, salt, 32)

        // const header = `NAME:${filename}\nSIZE:${filesize}\nSALT:${salt.toString('hex')}\nIV:${iv.toString('hex')}\n\n`;
        const header = JSON.stringify({
            filename,
            filesize,
            salt: salt.toString('hex'),
            iv: iv.toString('hex')
        })
        const headerLength = header.length;

        const headerLengthBuffer = Buffer.alloc(4)
        headerLengthBuffer.writeUInt32BE(headerLength);

        client.write(headerLengthBuffer)
        client.write(header)

        const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
        const fileReadStream = fs.createReadStream(filepath);
        const progress = trackProgress(filesize, 'send')

        fileReadStream.pipe(cipher).pipe(progress).pipe(client, { end: false })

        fileReadStream.on("error", (err) => console.error(err))
        fileReadStream.on("end", () => {
            const tag = cipher.getAuthTag()
            client.write(tag)
            console.log(`\nFile ${filename} sent successfully!`);
            client.end()
        })
    })

    client.on('data', (data) => {
        console.log('\n📨 Server response:', data.toString());
    });

    client.on('error', (err) => {
        console.error('Client error:', err.message);
    });
}