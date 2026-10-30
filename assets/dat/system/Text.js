// 글자 도우미 (한국어 조사 등). 어디서나 쓴다

// 받침에 따라 조사 고르기: josa("쥐", "이가") → "쥐가", josa("당신", "이가") → "당신이"
// 숫자로 끝나면 숫자 읽기로 받침을 본다 (x3 → 삼 → 받침 있음)
function josa(word, pair) {
    let last = word.charCodeAt(word.length - 1);
    const digit = word[word.length - 1];
    if (digit >= "0" && digit <= "9") last = "영일이삼사오육칠팔구".charCodeAt(Number(digit));
    const code = last - 0xac00;
    const batchim = code >= 0 && code <= 11171 && code % 28 !== 0;
    return word + (batchim ? pair[0] : pair[1]);
}
