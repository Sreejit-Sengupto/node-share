import { sendFile } from './send-file';
import path from 'path';
import { statSync } from 'fs';
import { receiveFile } from './receive-file';

const cmdLineArgs = process.argv

const mode: 'recv' | 'send' | 'nil' = (() => {
    switch (cmdLineArgs[2]) {
        case '--receive':
            return 'recv';
        case '--send':
            return 'send';
        default:
            return 'nil';
    }
})();
const host = cmdLineArgs[3]

if (mode === 'nil') {
    throw new Error("Transfer mode flag is required (--receive or --send)")
}

if (!host) {
    throw new Error("Host address is required")
}


if (mode === 'recv') {
    const password = cmdLineArgs[4]
    if (!password) {
        throw new Error("You need to add a password")
    } else if (password.length < 6) {
        throw new Error("Password should be atleast 6 characters long")
    }
    receiveFile(password)
}

if (mode === 'send') {
    const filePath = cmdLineArgs[4];
    const password = cmdLineArgs[5];
    if (!password) {
        throw new Error("You need to add a password")
    } else if (password.length < 6) {
        throw new Error("Password should be atleast 6 characters long")
    }
    const filename = path.basename(filePath);
    const filesize = statSync(filePath).size;
    sendFile(host, filePath, filename, filesize, password)
}