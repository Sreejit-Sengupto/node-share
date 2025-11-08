import net from 'net'
import fs, { WriteStream } from 'fs'
import { PassThrough, Transform } from 'stream';
import { trackProgress } from './progress';
import crypto, { DecipherGCM } from 'crypto';

// export const receiveFile = (password: string) => {
//     const server = net.createServer((socket) => {
//         console.log("Sender connected");

//         let state: "metadata" | "data" = "metadata";
//         let headerBuffer = Buffer.alloc(0);
//         let metadata: { NAME: string, SIZE: number, SALT: Buffer | null, IV: Buffer | null } = { NAME: "", SIZE: -1, SALT: null, IV: null };
//         let writeStream: WriteStream | null = null
//         let progress: Transform | null = null
//         let decipher: DecipherGCM | null = null

//         const dataHandler = (chunk: Buffer) => {
//             if (state === "metadata") {
//                 headerBuffer = Buffer.concat([headerBuffer, chunk]);
//                 const headerEnd = headerBuffer.indexOf('\n\n');

//                 if (headerEnd !== -1) {
//                     const headerData = headerBuffer.subarray(0, headerEnd).toString();

//                     for (const line of headerData.split("\n")) {
//                         const [key, val] = line.split(":");
//                         switch (key) {
//                             case 'NAME':
//                                 metadata.NAME = val;
//                                 break;
//                             case 'SIZE':
//                                 metadata.SIZE = parseInt(val, 10);
//                                 break;
//                             case 'SALT':
//                                 metadata.SALT = Buffer.from(val, 'hex');
//                                 break;
//                             case 'IV':
//                                 metadata.IV = Buffer.from(val, 'hex');
//                                 break;
//                             default:
//                                 break;
//                         }
//                     }

//                     const filename = metadata.NAME;
//                     const filesize = metadata.SIZE;
//                     const salt = metadata.SALT;
//                     const iv = metadata.IV;

//                     if (!filename || isNaN(filesize) || !salt || !iv) {
//                         socket.end('ERROR: Invalid metadata');
//                         return;
//                     }

//                     console.log(`Receiving: ${filename}`);

//                     state = "data"
//                     writeStream = fs.createWriteStream(filename);
//                     progress = trackProgress(filesize, 'recv');

//                     const key = crypto.scryptSync(password, salt, 32)
//                     decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)

//                     decipher.on('error', () => {
//                         console.error('\nFAILED: Wrong password or tampered data');
//                         fs.unlink(filename, () => { }); // Delete the corrupted file
//                     });

//                     writeStream.on("finish", () => {
//                         console.log('\nDecryption & integrity verified!');
//                         socket.end('Transfer complete');
//                     });

//                     socket.removeListener('data', dataHandler);
//                     socket.pipe(decipher).pipe(progress).pipe(writeStream);

//                     const dataChunk = headerBuffer.subarray(headerEnd + 2);
//                     if (dataChunk.length > 0) {
//                         socket.unshift(dataChunk);
//                     }
//                 }
//             }
//         }

//         socket.on('data', dataHandler);

//         socket.on('error', (err) => {
//             console.error(err);
//         })

//         socket.on('end', () => {
//             if (state === 'data') writeStream?.end();
//         });
//     });

//     server.listen(3001, () => {
//         console.log("Server up on :3001");
//         console.log('Waiting for the sender...');
//     })
// }

const AUTH_TAG_LENGTH = 16;

export const receiveFile = (password: string) => {
    const server = net.createServer((socket) => {
        console.log("Sender connected");

        // variables for controlling header extraction
        let state: "len" | "header" | "streaming" = "len"; // Different stages of receiving the file.
        let buffer = Buffer.alloc(0); // Create a empty buffer to store the incoming data.
        let expectedHeaderLength = 0; // The length of the expected header.

        // Simple handler to log messages for error cases
        const abort = (msg?: string) => {
            if (msg) {
                console.error(msg);
            }
            try {
                socket.end();
            } catch (e) { }
        }

        // Transformer for extracting the Auth Tag
        const createAuthTagExtractor = () => {
            let tail = Buffer.alloc(0); // Emtpy Buffer to store chunks from upper pipe
            return new Transform({
                transform(chunk, encoding, callback) {
                    tail = Buffer.concat([tail, chunk]) // Append data from upper pipe.
                    // We can only extract the auth-tag if the buffer is greater than 16 bytes
                    if (tail.length >= AUTH_TAG_LENGTH) {
                        // Extract the extra data (The chunk may contain some data + the auth tag)
                        const dataToPassLength = tail.length - AUTH_TAG_LENGTH;
                        this.push(tail.subarray(0, dataToPassLength)) // push the extra data down the pipe
                        tail = tail.subarray(dataToPassLength) // Store the auth tag
                    }
                    callback();
                },

                // Emit the auth tag when the stream has finished
                flush(callback) {
                    this.emit('auth-tag', tail)
                    callback()
                }
            })
        }

        socket.on('data', (chunk) => {
            // To store the incoming data from the sender
            buffer = Buffer.concat([buffer, chunk])

            // The first 4 bytes represent the length of the header
            // So if the keep on collecting the incoming data until >= 4 so the header length can be extracted.
            if (state === "len" && buffer.length >= 4) {
                expectedHeaderLength = buffer.readUInt32BE(0) // reads first 4 bytes
                // Strip the buffer to keep the data after header length i.e the header itself (if present)
                buffer = buffer.subarray(4)
                // Change the state so that this doesn't re-run for this particular socket stream.
                state = "header"
            }

            // We can only extract the header if the length of the buffer >= header length, else keep collecting...
            if (state === "header" && expectedHeaderLength !== 0 && buffer.length >= expectedHeaderLength) {
                // The first bytes are the header data
                // For eg: if header length is 20 then, extract the data from the buffer upto 20 bytes.
                // That's the header.
                const headerBuffer = buffer.subarray(0, expectedHeaderLength);
                // Remove the header data and keep rest of the data (ecrypted file data) in the buffer
                buffer = buffer.subarray(expectedHeaderLength);

                // Meta data extraction
                let metadata: { filename: string; filesize: number; salt: string; iv: string };
                try {
                    metadata = JSON.parse(headerBuffer.toString('utf-8'))
                } catch (error) {
                    abort('ERROR: invalid header JSON');
                    return;
                }

                if (!metadata?.filename || typeof metadata.filesize !== 'number' || !metadata.salt || !metadata.iv) {
                    abort('ERROR: header missing required fields');
                    return;
                }

                console.log(`Receiving: ${metadata.filename} (${metadata.filesize} bytes)`);

                // Setup Decipher
                const salt = Buffer.from(metadata.salt, 'hex')
                const iv = Buffer.from(metadata.iv, 'hex')

                let decipher: DecipherGCM;
                try {
                    const key = crypto.scryptSync(password, salt, 32)
                    decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
                } catch (error) {
                    abort('ERROR: failed to create decipher');
                    return;
                }

                // Create the streams
                const writeStream = fs.createWriteStream(metadata.filename)
                const progress = trackProgress(metadata.filesize, 'recv')

                decipher.on('error', (err) => {
                    console.error('\nFAILED: Wrong password or tampered data', err.message || err);
                    writeStream.close();
                    fs.unlink(metadata.filename, () => { });
                });

                writeStream.on('finish', () => {
                    console.log('\nDecryption & integrity verified! File saved:', metadata.filename);
                    socket.end('Transfer complete');
                });

                // pass is used to pass input bytes accross a outputs
                // We will pipe everything and with pass and later append it to socket after removing the 'data' listner
                const pass = new PassThrough()
                const authTagExtractor = createAuthTagExtractor()

                // This listen for the auth-tag event and adds the auth tag to the decipher before it finalizes.
                authTagExtractor.on('auth-tag', (authTag: Buffer) => {
                    if (!authTag || authTag.length !== AUTH_TAG_LENGTH) {
                        console.error('Invalid auth tag length:', authTag?.length);
                        return;
                    }
                    try {
                        decipher.setAuthTag(authTag)
                    } catch (error) {
                        console.error('Failed to set auth tag:', error);
                    }
                })

                // Create the pipe
                pass.pipe(authTagExtractor).pipe(decipher).pipe(progress).pipe(writeStream);

                // If any remenant data is present in the buffer
                // push it to the pipe and clear the buffer
                if (buffer.length > 0) {
                    pass.push(buffer);
                    buffer = Buffer.alloc(0);
                }

                // Remove the data event-listner before setting off the socket stream to auto-mode
                socket.removeAllListeners('data')
                socket.pipe(pass)

                state = 'streaming';
            }
        })

        socket.on('end', () => {
            // stream ends will trigger flush on stripper which emits authTag and let decipher finalize.
            console.log('Connection ended by sender');
        });

        socket.on('error', (err) => {
            console.error('Socket error:', err.message);
        });
    })

    server.listen(3001, () => console.log("Server is listening on http://localhost:3001"))
}