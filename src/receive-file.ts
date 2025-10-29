import net from 'net'
import fs, { write, WriteStream } from 'fs'
import { Transform } from 'stream';
import { trackProgress } from './progress';
import crypto, { CipherGCM, DecipherGCM } from 'crypto';

let lastChunk: Buffer | null = null
const captureLastChunk = new Transform({
    transform(chunk, encoding, callback) {
        lastChunk = chunk
        callback(null, chunk)
    }
})

export const receiveFile = (password: string) => {
    const server = net.createServer((socket) => {
        console.log("Sender connected\n");

        let state: "metadata" | "data" = "metadata";
        let header = "";
        let metadata: { NAME: string, SIZE: number, SALT: Buffer | null, IV: Buffer | null } = { NAME: "", SIZE: -1, SALT: null, IV: null };
        let writeStream: WriteStream | null = null
        let progress: Transform | null = null
        let decipher: DecipherGCM | null = null

        socket.on('data', (chunk) => {
            if (state === "metadata") {
                header += chunk.toString();
                const headerEnd = header.indexOf("\n\n");
                if (headerEnd !== -1) {
                    const headerData = header.slice(0, headerEnd);
                    console.log("Header Data: ", headerData);

                    for (const line of headerData.split("\n")) {
                        const [key, val] = line.split(":");
                        switch (key) {
                            case 'NAME':
                                metadata.NAME = val;
                                break;
                            case 'SIZE':
                                metadata.SIZE = parseInt(val, 10);
                                break;
                            case 'SALT':
                                metadata.SALT = Buffer.from(val, 'hex');
                                break;
                            case 'IV':
                                metadata.IV = Buffer.from(val, 'hex');
                                break;
                            default:
                                break;
                        }
                    }

                    const filename = metadata.NAME;
                    const filesize = metadata.SIZE;
                    const salt = metadata.SALT;
                    const iv = metadata.IV;

                    console.log(typeof iv);
                    if (!filename || isNaN(filesize) || !salt || !iv) {
                        // console.log(metadata);



                        socket.end('ERROR: Invalid metadata');
                        return;
                    }

                    console.log(`\nReceiving: ${filename}\n`);

                    state = "data"
                    writeStream = fs.createWriteStream(filename);
                    progress = trackProgress(filesize, 'recv');

                    const key = crypto.scryptSync(password, salt, 32)
                    decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)

                    socket.pipe(decipher).pipe(captureLastChunk).pipe(progress).pipe(writeStream)

                    const dataChunk = chunk.subarray(headerEnd + 2);
                    if (dataChunk.length > 0) {
                        decipher.write(dataChunk)
                    }
                }
            }

            writeStream?.on("finish", () => {
                if (lastChunk && decipher) {
                    if (lastChunk.length >= 16) {
                        const tag = lastChunk.subarray(-16)
                        const encryptedData = lastChunk.subarray(0, lastChunk.length - 16);

                        try {
                            decipher.write(encryptedData)
                            decipher.setAuthTag(tag)
                            decipher.final()
                            console.log('\nDecryption & integrity verified!');
                        } catch (error) {
                            console.error('\nFAILED: Wrong password or tampered data');
                        }
                    }
                }
                socket.end('Transfer complete');
            })
        });

        socket.on('error', (err) => {
            console.error(err);
        })

        socket.on('end', () => {
            if (state === 'data') writeStream?.end();
        });
    });



    server.listen(3001, () => {
        console.log("Server up on :3001\n");
        console.log('Waiting for the sender...\n');
    })
}