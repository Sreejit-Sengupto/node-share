import net from 'net'
import fs from 'fs'
import crypto from 'crypto'
import { PORT } from './constants'
import { trackProgress } from './progress'

export const sendFile = (host: string, filepath: string, filename: string, filesize: number, password: string) => {
    const client = net.connect(PORT, host, () => {
        console.log(`Connected to ${host} on PORT:${PORT}`);

        const salt = crypto.randomBytes(16);
        const iv = crypto.randomBytes(12);
        const key = crypto.scryptSync(password, salt, 32)

        const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)

        const header = `NAME:${filename}\nSIZE:${filesize}\nSALT:${salt.toString('hex')}\nIV:${iv.toString('hex')}\n\n`;

        client.write(header)

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