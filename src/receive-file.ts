import net from 'net'
import fs, { WriteStream } from 'fs'
import { Transform } from 'stream';
import { trackProgress } from './progress';
import crypto, { DecipherGCM } from 'crypto';

export const receiveFile = (password: string) => {
    const server = net.createServer((socket) => {
        console.log("Sender connected");

        let state: "metadata" | "data" = "metadata";
        let headerBuffer = Buffer.alloc(0);
        let metadata: { NAME: string, SIZE: number, SALT: Buffer | null, IV: Buffer | null } = { NAME: "", SIZE: -1, SALT: null, IV: null };
        let writeStream: WriteStream | null = null
        let progress: Transform | null = null
        let decipher: DecipherGCM | null = null

        const dataHandler = (chunk: Buffer) => {
            if (state === "metadata") {
                headerBuffer = Buffer.concat([headerBuffer, chunk]);
                const headerEnd = headerBuffer.indexOf('\n\n');

                if (headerEnd !== -1) {
                    const headerData = headerBuffer.subarray(0, headerEnd).toString();

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

                    if (!filename || isNaN(filesize) || !salt || !iv) {
                        socket.end('ERROR: Invalid metadata');
                        return;
                    }

                    console.log(`Receiving: ${filename}`);

                    state = "data"
                    writeStream = fs.createWriteStream(filename);
                    progress = trackProgress(filesize, 'recv');

                    const key = crypto.scryptSync(password, salt, 32)
                    decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)

                    decipher.on('error', () => {
                        console.error('\nFAILED: Wrong password or tampered data');
                        fs.unlink(filename, () => { }); // Delete the corrupted file
                    });

                    writeStream.on("finish", () => {
                        console.log('\nDecryption & integrity verified!');
                        socket.end('Transfer complete');
                    });

                    socket.removeListener('data', dataHandler);
                    socket.pipe(decipher).pipe(progress).pipe(writeStream);

                    const dataChunk = headerBuffer.subarray(headerEnd + 2);
                    if (dataChunk.length > 0) {
                        socket.unshift(dataChunk);
                    }
                }
            }
        }

        socket.on('data', dataHandler);

        socket.on('error', (err) => {
            console.error(err);
        })

        socket.on('end', () => {
            if (state === 'data') writeStream?.end();
        });
    });

    server.listen(3001, () => {
        console.log("Server up on :3001");
        console.log('Waiting for the sender...');
    })
}
