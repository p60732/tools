#!/usr/bin/env python3
"""幼兒遊戲語音整理工具
python3 build.py lines   → 從各遊戲抓出固定台詞,寫 lines.json(錄音室用)
python3 build.py tts     → 用台灣口音語音(edge-tts)把台詞做成 mp3,寫 manifest.json
"""
import json, re, sys, hashlib, pathlib, asyncio
HERE = pathlib.Path(__file__).resolve().parent
GAMES = HERE.parent / 'games'
NAMES = {'stories': '說故事', 'farm': '快樂農場', 'tram': '天空電車', 'ooxx': 'OOXX', 'dig': '挖寶沙坑', 'passcode': '密碼解鎖'}
VOICE = 'zh-TW-HsiaoChenNeural'
# 程式裡組出來的句子(站名、輪到誰),列出來才能錄
EXTRA = {
  'tram': ['尾浦站到了,請開門讓客人上車', '歡迎搭乘天空電車', '海景站,請小心上下車', '青沙浦站,請小心上下車',
           '門要關了,下一站,海景站', '門要關了,下一站,青沙浦站', '快到海景站了', '快到青沙浦站了', '海景站到了', '終點站,青沙浦站到了'],
  'ooxx': ['小朋友先下,點一個格子', '機器人先下', '大人先下', '換小朋友', '換大人', '機器人贏了,再來一次', '大人贏了,再來一次'],
}

def lines():
    out = []
    for key, name in NAMES.items():
        src = (GAMES / f'{key}.html').read_text(encoding='utf-8')
        if key == 'stories':
            groups = []
            for m in re.finditer(r"\{id:'(\w+)',name:'([^']+)'.*?\n \]\}", src, re.S):
                ts = re.findall(r"\{t:'([^']+)'", m.group(0))
                groups.append({'name': '說故事・' + m.group(2), 'lines': ts})
            extra = re.findall(r"KV\.say\('([^']+)'\)", src)
            out += groups
            if extra: out.append({'name': '說故事・其他', 'lines': sorted(set(extra))})
            continue
        found = []
        for m in re.finditer(r"talk\('([^'\\]+)'\)", src):
            s = m.group(1)
            if s not in found: found.append(s)
        for s in EXTRA.get(key, []):
            if s not in found: found.append(s)
        if found: out.append({'name': name, 'lines': found})
    (HERE / 'lines.json').write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
    print('lines:', sum(len(g['lines']) for g in out))
    return out

async def tts():
    import edge_tts
    groups = lines()
    man_p = HERE / 'manifest.json'
    man = json.loads(man_p.read_text(encoding='utf-8')) if man_p.exists() else {}
    (HERE / 'tts').mkdir(exist_ok=True)
    for g in groups:
        for t in g['lines']:
            f = 'tts/' + hashlib.sha1(t.encode()).hexdigest()[:12] + '.mp3'
            if t in man and (HERE / f).exists():
                continue
            await edge_tts.Communicate(t, VOICE, rate='-5%', pitch='+8Hz').save(str(HERE / f))
            man[t] = f
            print('ok', t)
    man_p.write_text(json.dumps(man, ensure_ascii=False, indent=1), encoding='utf-8')

if __name__ == '__main__':
    if sys.argv[1:] == ['tts']:
        asyncio.run(tts())
    else:
        lines()
