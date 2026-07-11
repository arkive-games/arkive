/**
 * Shared MiniSearch tokenizer for the map search and the global search.
 * Tokenize into Latin-letter runs, digit runs, and single CJK chars
 * (kana U+3040-U+30FF, unified ideographs U+3400-U+9FFF, compatibility
 * ideographs U+F900-U+FAFF, hangul U+AC00-U+D7AF — beware: the U+F900
 * range start is an NFC-normalization trap; verify code points if editing).
 * Splitting letters from digits means a suffixed id like "No.111B" yields
 * the number token "111" (findable by a numeric query) while CJK still
 * matches per character. Strip leading zeros from numeric tokens (index +
 * query) so "11"/"011" both match a zero-padded id token "011" (No.011).
 */
export function searchTokenize(s: string): string[] {
  return (
    s.match(/[a-zA-Z]+|[0-9]+|[぀-ヿ㐀-鿿豈-﫿가-힯]/g) ?? []
  ).map((t) => (/^\d+$/.test(t) ? t.replace(/^0+(?=\d)/, "") : t))
}
