// MD5 (RFC 1321), used for ESP serial transfer and RNode EEPROM checksums.
// Preserves the existing public-domain implementation; release images use SHA-256.
export function md5Bytes(input) {
    function rotl(x, n) { return (x << n) | (x >>> (32 - n)); }
    function add32(a, b) { return (a + b) & 0xFFFFFFFF; }
    function ff(a,b,c,d,x,s,t){return add32(rotl(add32(add32(a,(b&c)|(~b&d)),add32(x,t)),s),b);}
    function gg(a,b,c,d,x,s,t){return add32(rotl(add32(add32(a,(b&d)|(c&~d)),add32(x,t)),s),b);}
    function hh(a,b,c,d,x,s,t){return add32(rotl(add32(add32(a,b^c^d),add32(x,t)),s),b);}
    function ii(a,b,c,d,x,s,t){return add32(rotl(add32(add32(a,c^(b|~d)),add32(x,t)),s),b);}
    var msg = new Uint8Array(input);
    var origLen = msg.length;
    var bitLen = origLen * 8;
    var padLen = ((origLen + 8) >>> 6) + 1;
    var padded = new Uint8Array(padLen * 64);
    padded.set(msg);
    padded[origLen] = 0x80;
    var view = new DataView(padded.buffer);
    view.setUint32(padded.length - 8, bitLen >>> 0, true);
    view.setUint32(padded.length - 4, Math.floor(bitLen / 0x100000000) >>> 0, true);
    var a = 0x67452301, b = 0xEFCDAB89, c = 0x98BADCFE, d = 0x10325476;
    for (var off = 0; off < padded.length; off += 64) {
        var X = new Array(16);
        for (var j = 0; j < 16; j++) X[j] = view.getUint32(off + j * 4, true);
        var aa = a, bb = b, cc = c, dd = d;
        a = ff(a,b,c,d,X[0],7,0xd76aa478);  d = ff(d,a,b,c,X[1],12,0xe8c7b756);
        c = ff(c,d,a,b,X[2],17,0x242070db); b = ff(b,c,d,a,X[3],22,0xc1bdceee);
        a = ff(a,b,c,d,X[4],7,0xf57c0faf);  d = ff(d,a,b,c,X[5],12,0x4787c62a);
        c = ff(c,d,a,b,X[6],17,0xa8304613); b = ff(b,c,d,a,X[7],22,0xfd469501);
        a = ff(a,b,c,d,X[8],7,0x698098d8);  d = ff(d,a,b,c,X[9],12,0x8b44f7af);
        c = ff(c,d,a,b,X[10],17,0xffff5bb1);b = ff(b,c,d,a,X[11],22,0x895cd7be);
        a = ff(a,b,c,d,X[12],7,0x6b901122); d = ff(d,a,b,c,X[13],12,0xfd987193);
        c = ff(c,d,a,b,X[14],17,0xa679438e);b = ff(b,c,d,a,X[15],22,0x49b40821);

        a = gg(a,b,c,d,X[1],5,0xf61e2562);  d = gg(d,a,b,c,X[6],9,0xc040b340);
        c = gg(c,d,a,b,X[11],14,0x265e5a51);b = gg(b,c,d,a,X[0],20,0xe9b6c7aa);
        a = gg(a,b,c,d,X[5],5,0xd62f105d);  d = gg(d,a,b,c,X[10],9,0x02441453);
        c = gg(c,d,a,b,X[15],14,0xd8a1e681);b = gg(b,c,d,a,X[4],20,0xe7d3fbc8);
        a = gg(a,b,c,d,X[9],5,0x21e1cde6);  d = gg(d,a,b,c,X[14],9,0xc33707d6);
        c = gg(c,d,a,b,X[3],14,0xf4d50d87); b = gg(b,c,d,a,X[8],20,0x455a14ed);
        a = gg(a,b,c,d,X[13],5,0xa9e3e905); d = gg(d,a,b,c,X[2],9,0xfcefa3f8);
        c = gg(c,d,a,b,X[7],14,0x676f02d9); b = gg(b,c,d,a,X[12],20,0x8d2a4c8a);

        a = hh(a,b,c,d,X[5],4,0xfffa3942);  d = hh(d,a,b,c,X[8],11,0x8771f681);
        c = hh(c,d,a,b,X[11],16,0x6d9d6122);b = hh(b,c,d,a,X[14],23,0xfde5380c);
        a = hh(a,b,c,d,X[1],4,0xa4beea44);  d = hh(d,a,b,c,X[4],11,0x4bdecfa9);
        c = hh(c,d,a,b,X[7],16,0xf6bb4b60); b = hh(b,c,d,a,X[10],23,0xbebfbc70);
        a = hh(a,b,c,d,X[13],4,0x289b7ec6); d = hh(d,a,b,c,X[0],11,0xeaa127fa);
        c = hh(c,d,a,b,X[3],16,0xd4ef3085); b = hh(b,c,d,a,X[6],23,0x04881d05);
        a = hh(a,b,c,d,X[9],4,0xd9d4d039);  d = hh(d,a,b,c,X[12],11,0xe6db99e5);
        c = hh(c,d,a,b,X[15],16,0x1fa27cf8);b = hh(b,c,d,a,X[2],23,0xc4ac5665);

        a = ii(a,b,c,d,X[0],6,0xf4292244);  d = ii(d,a,b,c,X[7],10,0x432aff97);
        c = ii(c,d,a,b,X[14],15,0xab9423a7);b = ii(b,c,d,a,X[5],21,0xfc93a039);
        a = ii(a,b,c,d,X[12],6,0x655b59c3); d = ii(d,a,b,c,X[3],10,0x8f0ccc92);
        c = ii(c,d,a,b,X[10],15,0xffeff47d);b = ii(b,c,d,a,X[1],21,0x85845dd1);
        a = ii(a,b,c,d,X[8],6,0x6fa87e4f);  d = ii(d,a,b,c,X[15],10,0xfe2ce6e0);
        c = ii(c,d,a,b,X[6],15,0xa3014314); b = ii(b,c,d,a,X[13],21,0x4e0811a1);
        a = ii(a,b,c,d,X[4],6,0xf7537e82);  d = ii(d,a,b,c,X[11],10,0xbd3af235);
        c = ii(c,d,a,b,X[2],15,0x2ad7d2bb); b = ii(b,c,d,a,X[9],21,0xeb86d391);

        a = add32(a, aa); b = add32(b, bb); c = add32(c, cc); d = add32(d, dd);
    }
    var out = new Uint8Array(16);
    var dvOut = new DataView(out.buffer);
    dvOut.setUint32(0, a, true);
    dvOut.setUint32(4, b, true);
    dvOut.setUint32(8, c, true);
    dvOut.setUint32(12, d, true);
    return out;
}
