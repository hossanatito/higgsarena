// Unit tests never touch a real database or the network.
process.env.ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString("base64");
