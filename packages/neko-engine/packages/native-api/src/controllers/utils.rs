//! Shared utilities for controllers

use std::io::Write;

/// Simple base64 encoding (no external dependency)
pub fn base64_encode(data: &[u8]) -> String {
    let mut buf = Vec::new();
    {
        let mut encoder = Base64Encoder::new(&mut buf);
        encoder.write_all(data).unwrap();
        encoder.finish().unwrap();
    }
    String::from_utf8(buf).unwrap()
}

/// Simple base64 encoder
struct Base64Encoder<W: Write> {
    writer: W,
    buffer: [u8; 3],
    buffer_len: usize,
}

const BASE64_CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

impl<W: Write> Base64Encoder<W> {
    fn new(writer: W) -> Self {
        Self {
            writer,
            buffer: [0; 3],
            buffer_len: 0,
        }
    }

    fn finish(mut self) -> std::io::Result<()> {
        if self.buffer_len > 0 {
            let mut out = [b'='; 4];
            out[0] = BASE64_CHARS[(self.buffer[0] >> 2) as usize];
            if self.buffer_len == 1 {
                out[1] = BASE64_CHARS[((self.buffer[0] & 0x03) << 4) as usize];
            } else {
                out[1] = BASE64_CHARS
                    [(((self.buffer[0] & 0x03) << 4) | (self.buffer[1] >> 4)) as usize];
                out[2] = BASE64_CHARS[((self.buffer[1] & 0x0f) << 2) as usize];
            }
            self.writer.write_all(&out)?;
        }
        Ok(())
    }
}

impl<W: Write> Write for Base64Encoder<W> {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        let mut written = 0;
        for &byte in buf {
            self.buffer[self.buffer_len] = byte;
            self.buffer_len += 1;
            if self.buffer_len == 3 {
                let out = [
                    BASE64_CHARS[(self.buffer[0] >> 2) as usize],
                    BASE64_CHARS
                        [(((self.buffer[0] & 0x03) << 4) | (self.buffer[1] >> 4)) as usize],
                    BASE64_CHARS
                        [(((self.buffer[1] & 0x0f) << 2) | (self.buffer[2] >> 6)) as usize],
                    BASE64_CHARS[(self.buffer[2] & 0x3f) as usize],
                ];
                self.writer.write_all(&out)?;
                self.buffer_len = 0;
            }
            written += 1;
        }
        Ok(written)
    }

    fn flush(&mut self) -> std::io::Result<()> {
        self.writer.flush()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_base64_encode_basic() {
        assert_eq!(base64_encode(b"Hello"), "SGVsbG8=");
        assert_eq!(base64_encode(b"Hello!"), "SGVsbG8h");
        assert_eq!(base64_encode(b""), "");
    }

    #[test]
    fn test_base64_encode_binary() {
        assert_eq!(base64_encode(&[0, 1, 2, 3]), "AAECAw==");
        assert_eq!(base64_encode(&[255, 254, 253]), "//79");
    }

    #[test]
    fn test_base64_encode_padding() {
        // 1 byte → 4 chars with ==
        assert_eq!(base64_encode(&[0]), "AA==");
        // 2 bytes → 4 chars with =
        assert_eq!(base64_encode(&[0, 0]), "AAA=");
        // 3 bytes → 4 chars no padding
        assert_eq!(base64_encode(&[0, 0, 0]), "AAAA");
    }
}
