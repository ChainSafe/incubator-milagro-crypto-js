/*
    Licensed to the Apache Software Foundation (ASF) under one
    or more contributor license agreements.  See the NOTICE file
    distributed with this work for additional information
    regarding copyright ownership.  The ASF licenses this file
    to you under the Apache License, Version 2.0 (the
    "License"); you may not use this file except in compliance
    with the License.  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing,
    software distributed under the License is distributed on an
    "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    KIND, either express or implied.  See the License for the
    specific language governing permissions and limitations
    under the License.
*/

var ECDH = function(ctx) {
    "use strict";

    /**
     * Creates an instance of ECDH
     *
     * @constructor
     * @this {ECDH}
    */    
    var ECDH = {

        INVALID_PUBLIC_KEY: -2,
        ERROR: -3,
        INVALID: -4,
        EFS: ctx.BIG.MODBYTES,
        EGS: ctx.BIG.MODBYTES,
        SHA256: 32,
        SHA384: 48,
        SHA512: 64,

	/**
         * Convert Integer to n-byte array 
         *
         * @this {ECDH}
         * @parameter n integer
         * @parameter len integer length
         * @return byte array
         */		
        inttobytes: function(n, len) {
            var b = [],
                i;

            for (i = 0; i < len; i++) {
                b[i] = 0;
            }

            i = len;
            while (n > 0 && i > 0) {
                i--;
                b[i] = (n & 0xff);
                n = Math.floor(n / 256);
            }

            return b;
        },

        /**
          * Convert byte array to string
          *
          * @this {ECDH}
          * @parameter b byte array
          * @return string
          */			
        bytestostring: function(b) {
            var s = "",
                len = b.length,
                ch, i;

            for (i = 0; i < len; i++) {
                ch = b[i];
                s += ((ch >>> 4) & 15).toString(16);
                s += (ch & 15).toString(16);
            }

            return s;
        },

       /**
         * Convert string to byte array 
         *
         * @this {ECDH}
         * @parameter s string
         * @return byte array
         */				
        stringtobytes: function(s) {
            var b = [],
                i;

            for (i = 0; i < s.length; i++) {
                b.push(s.charCodeAt(i));
            }

            return b;
        },

        /**
          *  general purpose hash function w=hash(B|n)
          *
          * @this {ECDH}
          * @parameter sha is the hash type
	  * @parameter A byte array involved in the hash
	  * @parameter n integer involved in the hash
          * @parameter pad padding
  	  * @return w output
          */		
        hashit: function(sha, A, n, B, pad) {
            var R = [],
                H, W, i, len;

            if (sha == this.SHA256) {
                H = new ctx.HASH256();
            } else if (sha == this.SHA384) {
                H = new ctx.HASH384();
            } else if (sha == this.SHA512) {
                H = new ctx.HASH512();
            }

            if (n > 0) {
                H.process_num(n);
            }
            if (B != null) {
                H.process_array(B);
            }
            R = H.hash();

            if (R.length == 0) {
                return null;
            }

            if (pad == 0) {
                return R;
            }

            W = [];

            len = pad; 

            if (sha >= len) {
                for (i = 0; i < len; i++) {
                    W[i] = R[i];
                }
            } else {
                for (i = 0; i < sha; i++) {
                    W[i + len - sha] = R[i];
                }

                for (i = 0; i < len - sha; i++) {
                    W[i] = 0;
                }
            }

            return W;
        },

	
        KDF1: function(sha, Z, olen) {
            /* NOTE: the parameter olen is the length of the output K in bytes */
            var hlen = sha,
                K = [],
                B = [],
                k = 0,
                counter, cthreshold, i;

            for (i = 0; i < K.length; i++) {
                K[i] = 0; // redundant?
            }

            cthreshold = Math.floor(olen / hlen);
            if (olen % hlen !== 0) {
                cthreshold++;
            }

            for (counter = 0; counter < cthreshold; counter++) {
                B = this.hashit(sha, Z, counter, null, 0);

                if (k + hlen > olen) {
                    for (i = 0; i < olen % hlen; i++) {
                        K[k++] = B[i];
                    }
                } else {
                    for (i = 0; i < hlen; i++) {
                        K[k++] = B[i];
                    }
                }
            }

            return K;
        },

        /**
          * IEEE-1363 Key Derivation Function - generates key K from inputs Z and P
          *
          * @this {ECDH}
          * @parameter sha is the hash type
	  * @parameter Z input byte array
	  * @parameter P input key derivation parameters - can be NULL
          * @parameter 0len is output desired length of key
  	  * @return K derived key
          */			
        KDF2: function(sha, Z, P, olen) {
            /* NOTE: the parameter olen is the length of the output k in bytes */
            var hlen = sha,
                K = [],
                B = [],
                k = 0,
                counter, cthreshold, i;

            for (i = 0; i < K.length; i++) {
                K[i] = 0; // redundant?
            }

            cthreshold = Math.floor(olen / hlen);
            if (olen % hlen !== 0) {
                cthreshold++;
            }

            for (counter = 1; counter <= cthreshold; counter++) {
                B = this.hashit(sha, Z, counter, P, 0);

                if (k + hlen > olen) {
                    for (i = 0; i < olen % hlen; i++) {
                        K[k++] = B[i];
                    }
                } else {
                    for (i = 0; i < hlen; i++) {
                        K[k++] = B[i];
                    }
                }
            }

            return K;
        },

	/**
          * Password Based Key Derivation Function - generates key K from password, salt and repeat counter
          *
          * @this {ECDH}
          * @parameter sha is the hash type
	  * @parameter Pass input password
	  * @parameter Salt salt value
          * @parameter rep Number of times to be iterated.
          * @parameter 0len is output desired length of key
  	  * @return key derived key
          */			
        PBKDF2: function(sha, Pass, Salt, rep, olen) {
            var F = new Array(sha),
                U = [],
                S = [],
                K = [],
                opt = 0,
                i, j, k, d, N, key;

            d = Math.floor(olen / sha);

            if (olen % sha !== 0) {
                d++;
            }

            opt = 0;

            for (i = 1; i <= d; i++) {
                for (j = 0; j < Salt.length; j++) {
                    S[j] = Salt[j];
                }

                N = this.inttobytes(i, 4);

                for (j = 0; j < 4; j++) {
                    S[Salt.length + j] = N[j];
                }

                this.HMAC(sha, S, Pass, F);

                for (j = 0; j < sha; j++) {
                    U[j] = F[j];
                }

                for (j = 2; j <= rep; j++) {
                    this.HMAC(sha, U, Pass, U);
                    for (k = 0; k < sha; k++) {
                        F[k] ^= U[k];
                    }
                }

                for (j = 0; j < sha; j++) {
                    K[opt++] = F[j];
                }
            }

            key = [];
            for (i = 0; i < olen; i++) {
                key[i] = K[i];
            }

            return key;
        },

	/**
          * HMAC of message M using key K to create tag of length tag.length
          *
          * @this {ECDH}
          * @parameter sha is the hash type
	  * @parameter M input message
	  * @parameter K input encryption key
          * @parameter tag is the output HMAC
  	  * @return error code
          */				
        HMAC: function(sha, M, K, tag) {
            /* Input is from an octet m        *
             * olen is requested output length in bytes. k is the key  *
             * The output is the calculated tag */
            var olen = tag.length,
                B = [],
                b = 64,
                K0, i;

            if (sha > 32) {
                b = 128;
            }

            K0 = new Array(b);

            //b=K0.length;
            if (olen < 4) {
                return 0;
            }

            for (i = 0; i < b; i++) {
                K0[i] = 0;
            }

            if (K.length > b) {
                B = this.hashit(sha, K, 0, null, 0);
                for (i = 0; i < sha; i++) {
                    K0[i] = B[i];
                }
            } else {
                for (i = 0; i < K.length; i++) {
                    K0[i] = K[i];
                }
            }

            for (i = 0; i < b; i++) {
                K0[i] ^= 0x36;
            }

            B = this.hashit(sha, K0, 0, M, 0);

            for (i = 0; i < b; i++) {
                K0[i] ^= 0x6a;
            }

            B = this.hashit(sha, K0, 0, B, olen);

            for (i = 0; i < olen; i++) {
                tag[i] = B[i];
            }

            return 1;
        },

	/**
          * AES encrypts a plaintext to a ciphtertext
          *
          * @this {ECDH}
	  * @parameter M input message
	  * @parameter K AES key
  	  * @return C Ciphertext
          */				
        AES_CBC_IV0_ENCRYPT: function(K, M) { /* ctx.AES CBC encryption, with Null IV and key K */
            /* Input is from an octet string M, output is to an octet string C */
            /* Input is padded as necessary to make up a full final block */
            var a = new ctx.AES(),
                buff = [],
                C = [],
                fin, padlen, i, j, ipt, opt;

            a.init(ctx.AES.CBC, K.length, K, null);

            ipt = opt = 0;
            fin = false;

            for (;;) {
                for (i = 0; i < 16; i++) {
                    if (ipt < M.length) {
                        buff[i] = M[ipt++];
                    } else {
                        fin = true;
                        break;
                    }
                }

                if (fin) {
                    break;
                }

                a.encrypt(buff);

                for (i = 0; i < 16; i++) {
                    C[opt++] = buff[i];
                }
            }

            /* last block, filled up to i-th index */

            padlen = 16 - i;
            for (j = i; j < 16; j++) {
                buff[j] = padlen;
            }
            a.encrypt(buff);
            for (i = 0; i < 16; i++) {
                C[opt++] = buff[i];
            }
            a.end();

            return C;
        },

	/**
          * AES encrypts a plaintext to a ciphtertext
          *
          * @this {ECDH}
	  * @parameter C Ciphertext
	  * @parameter K AES key
  	  * @return P Plaintext
          */					
        AES_CBC_IV0_DECRYPT: function(K, C) { /* padding is removed */
            var a = new ctx.AES(),
                buff = [],
                MM = [],
                ipt = 0,
                opt = 0,
                M, ch, fin, bad, padlen, i;

            a.init(ctx.AES.CBC, K.length, K, null);

            if (C.length === 0) {
                return [];
            }
            ch = C[ipt++];

            fin = false;

            for (;;) {
                for (i = 0; i < 16; i++) {
                    buff[i] = ch;
                    if (ipt >= C.length) {
                        fin = true;
                        break;
                    } else {
                        ch = C[ipt++];
                    }
                }
                a.decrypt(buff);
                if (fin) {
                    break;
                }

                for (i = 0; i < 16; i++) {
                    MM[opt++] = buff[i];
                }
            }

            a.end();
            bad = false;
            padlen = buff[15];

            if (i != 15 || padlen < 1 || padlen > 16) {
                bad = true;
            }

            if (padlen >= 2 && padlen <= 16) {
                for (i = 16 - padlen; i < 16; i++) {
                    if (buff[i] != padlen) {
                        bad = true;
                    }
                }
            }

            if (!bad) {
                for (i = 0; i < 16 - padlen; i++) {
                    MM[opt++] = buff[i];
                }
            }

            M = [];
            if (bad) {
                return M;
            }

            for (i = 0; i < opt; i++) {
                M[i] = MM[i];
            }

            return M;
        },

	/**
          * Generate an ECC public/private key pair
          *
          * @this {ECDH}
          * @parameter rng Cryptographically Secure Random Number Generator
	  * @parameter S the private key
	  * @parameter W the output public key, which is s.G, where G is a fixed generator
      * @parameter C boolean indicating to compress pubkey
  	  * @return 0 or an error code
          */						
        KEY_PAIR_GENERATE: function(RNG, S, W, C) {
            var res = 0,
                r, s, G, WP;
            // var T=[];

            G = ctx.ECP.generator();

            r = new ctx.BIG(0);
            r.rcopy(ctx.ROM_CURVE.CURVE_Order);

            if (RNG === null) {
                s = ctx.BIG.fromBytes(S);
                s.mod(r);
            } else {
                s = ctx.BIG.randomnum(r, RNG);
            }

            s.toBytes(S);

            WP = G.mul(s);
            WP.toBytes(W, C);  // To use point compression on public keys, change to true 

            return res;
        },

	/**
          * Generate an ECC public/private key pair
          *
          * @this {ECDH}
	  * @parameter W the input public key to be validated
  	  * @return 0 or an error code
          */					
        PUBLIC_KEY_VALIDATE: function(W) {
            var WP = ctx.ECP.fromBytes(W),
                res = 0,
                r, q, nb, k;

            r = new ctx.BIG(0);
            r.rcopy(ctx.ROM_CURVE.CURVE_Order);

            if (WP.is_infinity()) {
                res = this.INVALID_PUBLIC_KEY;
            }

            if (res === 0) {
                q = new ctx.BIG(0);
                q.rcopy(ctx.ROM_FIELD.Modulus);
                nb = q.nbits();
                k = new ctx.BIG(1);
                k.shl(Math.floor((nb + 4) / 2));
                k.add(q);
                k.div(r);

                while (k.parity() == 0) {
                    k.shr(1);
                    WP.dbl();
                }

                if (!k.isunity()) {
                    WP = WP.mul(k);
                }

                if (WP.is_infinity()) {
                    res = this.INVALID_PUBLIC_KEY;
                }
            }

            return res;
        },

	/**
          * Generate Diffie-Hellman shared key
          *
          * @this {ECDH}
	  * @parameter S the private key
	  * @parameter W the output public key, which is s.G, where G is a fixed generator
	  * @parameter K the output shared key, in fact the x-coordinate of s.W
  	  * @return 0 or an error code
          */							
        ECPSVDP_DH: function(S, WD, Z) {
            var T = [],
                res = 0,
                r, s, i,
                W;

            s = ctx.BIG.fromBytes(S);

            W = ctx.ECP.fromBytes(WD);
            if (W.is_infinity()) {
                res = this.ERROR;
            }

            if (res === 0) {
                r = new ctx.BIG(0);
                r.rcopy(ctx.ROM_CURVE.CURVE_Order);
                s.mod(r);
                W = W.mul(s);

                if (W.is_infinity()) {
                    res = this.ERROR;
                } else {
                    W.getX().toBytes(T);
                    for (i = 0; i < this.EFS; i++) {
                        Z[i] = T[i];
                    }
                }
            }

            return res;
        },

	/**
          * ECDSA Signature
          *
          * @this {ECDH}
          * @parameter sha is the hash type
          * @parameter RNG Cryptographically Secure Random Number Generator
	  * @parameter S the private key
	  * @parameter F the input message to be signed
	  * @parameter C component of the output signature
	  * @parameter D component of the output signature
  	  * @return 0 or an error code
          */								
        ECPSP_DSA: function(sha, RNG, S, F, C, D) {
            var T = [],
                i, r, s, f, c, d, u, vx, w,
                G, V, B;

            B = this.hashit(sha, F, 0, null, ctx.BIG.MODBYTES);

            G = ctx.ECP.generator();

            r = new ctx.BIG(0);
            r.rcopy(ctx.ROM_CURVE.CURVE_Order);

            s = ctx.BIG.fromBytes(S);
            f = ctx.BIG.fromBytes(B);

            c = new ctx.BIG(0);
            d = new ctx.BIG(0);
            V = new ctx.ECP();

            do {
                u = ctx.BIG.randomnum(r, RNG);
                w = ctx.BIG.randomnum(r, RNG);  /* side channel masking */
                V.copy(G);
                V = V.mul(u);
                vx = V.getX();
                c.copy(vx);
                c.mod(r);
                if (c.iszilch()) {
                    continue;
                }
                u = ctx.BIG.modmul(u, w, r);
                u.invmodp(r);
                d = ctx.BIG.modmul(s, c, r);
                d.add(f);
                d = ctx.BIG.modmul(d, w, r);
                d = ctx.BIG.modmul(u, d, r);
            } while (d.iszilch());

            c.toBytes(T);
            for (i = 0; i < this.EFS; i++) {
                C[i] = T[i];
            }
            d.toBytes(T);
            for (i = 0; i < this.EFS; i++) {
                D[i] = T[i];
            }

            return 0;
        },

	/**
          * ECDSA Signature Verification
          *
          * @this {ECDH}
          * @parameter sha is the hash type
	  * @parameter W the public key
	  * @parameter F the input message to be signed
	  * @parameter C component of the output signature
	  * @parameter D component of the output signature
  	  * @return 0 or an error code
          */									
        ECPVP_DSA: function(sha, W, F, C, D) {
            var B = [],
                res = 0,
                r, f, c, d, h2,
                G, WP, P;

            B = this.hashit(sha, F, 0, null, ctx.BIG.MODBYTES);

            G = ctx.ECP.generator();

            r = new ctx.BIG(0);
            r.rcopy(ctx.ROM_CURVE.CURVE_Order);

            c = ctx.BIG.fromBytes(C);
            d = ctx.BIG.fromBytes(D);
            f = ctx.BIG.fromBytes(B);

            if (c.iszilch() || ctx.BIG.comp(c, r) >= 0 || d.iszilch() || ctx.BIG.comp(d, r) >= 0) {
                res = this.INVALID;
            }

            if (res === 0) {
                d.invmodp(r);
                f = ctx.BIG.modmul(f, d, r);
                h2 = ctx.BIG.modmul(c, d, r);

                WP = ctx.ECP.fromBytes(W);
                if (WP.is_infinity()) {
                    res = this.ERROR;
                } else {
                    P = new ctx.ECP();
                    P.copy(WP);
                    P = P.mul2(h2, G, f);

                    if (P.is_infinity()) {
                        res = this.INVALID;
                    } else {
                        d = P.getX();
                        d.mod(r);
                        if (ctx.BIG.comp(d, c) !== 0) {
                            res = this.INVALID;
                        }
                    }
                }
            }

            return res;
        },

	/**
          * ECIES Encryption
          *
          * @this {ECDH}
          * @parameter sha is the hash type
	  * @parameter P1 input Key Derivation parameters
	  * @parameter P2 input Encoding parameters
          * @parameter RNG Cryptographically Secure Random Number Generator
	  * @parameter W the public key
	  * @parameter M the input message to be encrypted
	  * @parameter V component of the output ciphertext
	  * @parameter T the output HMAC tag, part of the ciphertext
  	  * @return C ciphertext
          */										
        ECIES_ENCRYPT: function(sha, P1, P2, RNG, W, M, V, T) {
            var Z = [],
                VZ = [],
                K1 = [],
                K2 = [],
                U = [],
                C = [],
                K, L2, AC, i;

            if (this.KEY_PAIR_GENERATE(RNG, U, V) !== 0) {
                return C;
            }

            if (this.ECPSVDP_DH(U, W, Z) !== 0) {
                return C;
            }

            for (i = 0; i < 2 * this.EFS + 1; i++) {
                VZ[i] = V[i];
            }

            for (i = 0; i < this.EFS; i++) {
                VZ[2 * this.EFS + 1 + i] = Z[i];
            }

            K = this.KDF2(sha, VZ, P1, 2*ctx.ECP.AESKEY);

            for (i = 0; i < ctx.ECP.AESKEY; i++) {
                K1[i] = K[i];
                K2[i] = K[ctx.ECP.AESKEY + i];
            }

            C = this.AES_CBC_IV0_ENCRYPT(K1, M);

            L2 = this.inttobytes(P2.length, 8);

            AC = [];
            for (i = 0; i < C.length; i++) {
                AC[i] = C[i];
            }
            for (i = 0; i < P2.length; i++) {
                AC[C.length + i] = P2[i];
            }
            for (i = 0; i < 8; i++) {
                AC[C.length + P2.length + i] = L2[i];
            }

            this.HMAC(sha, AC, K2, T);

            return C;
        },

		ncomp: function(T1,T2,n) {
			var res=0;
			for (var i=0;i<n;i++)
			{
				res|=(T1[i]^T2[i]);
			}
			if (res==0) return true;
			return false;
		},

	/**
          * ECIES Encryption
          *
          * @this {ECDH}
          * @parameter sha is the hash type
	  * @parameter P1 input Key Derivation parameters
	  * @parameter P2 input Encoding parameters
	  * @parameter V component of the output ciphertext
          * @parameter C Ciphertext
	  * @parameter T the output HMAC tag, part of the ciphertext
	  * @parameter U the private key
  	  * @return M plaintext
          */											
        ECIES_DECRYPT: function(sha, P1, P2, V, C, T, U) {
            var Z = [],
                VZ = [],
                K1 = [],
                K2 = [],
                TAG = new Array(T.length),
                M = [],
                K, L2, AC, same, i;

            if (this.ECPSVDP_DH(U, V, Z) !== 0) {
                return M;
            }

            for (i = 0; i < 2 * this.EFS + 1; i++) {
                VZ[i] = V[i];
            }

            for (i = 0; i < this.EFS; i++) {
                VZ[2 * this.EFS + 1 + i] = Z[i];
            }

            K = this.KDF2(sha, VZ, P1, 2*ctx.ECP.AESKEY);

            for (i = 0; i < ctx.ECP.AESKEY; i++) {
                K1[i] = K[i];
                K2[i] = K[ctx.ECP.AESKEY + i];
            }

            M = this.AES_CBC_IV0_DECRYPT(K1, C);

            if (M.length === 0) {
                return M;
            }

            L2 = this.inttobytes(P2.length, 8);

            AC = [];

            for (i = 0; i < C.length; i++) {
                AC[i] = C[i];
            }
            for (i = 0; i < P2.length; i++) {
                AC[C.length + i] = P2[i];
            }
            for (i = 0; i < 8; i++) {
                AC[C.length + P2.length + i] = L2[i];
            }

            this.HMAC(sha, AC, K2, TAG);

			if (!this.ncomp(T,TAG,T.length)) {
				return [];
			}

            return M;
        }
    };

    return ECDH;
};

if (typeof module !== "undefined" && typeof module.exports !== "undefined") {
    module.exports = {
        ECDH: ECDH
    };
}
