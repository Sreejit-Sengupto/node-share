import { Transform } from 'stream'

export const trackProgress = (filesize: number, mode: 'recv' | 'send') => {
    let processed = 0;
    return new Transform({
        transform(chunk, encoding, callback) {
            processed += chunk.length;
            const percent = (processed / filesize * 100).toFixed(1);
            process.stdout.write(`\r${mode === 'recv' ? "Received " : "Transferred "} : ${percent}`)
            callback(null, chunk)
        }
    })
}