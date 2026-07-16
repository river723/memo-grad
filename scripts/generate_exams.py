#!/usr/bin/env python3
"""Generate realExams.json with 2025 English 2 data + existing 2023 data."""
import json, os
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(BASE, "src", "data", "realExams.json")

data = [
  {
    "year": 2023,
    "english1": {"reading": [], "cloze": None},
    "english2": {
      "reading": [{
        "id": "2023-e2-text1", "title": "Text 1",
        "passage": "Rising temperatures across the globe are changing more than just the weather. In the past decade, scientists have documented shifts in animal migration patterns, plant flowering times, and ocean chemistry that would once have taken centuries to unfold. What makes the current wave of change so alarming is not merely its scale, but its speed.\n\nA growing body of research suggests that many species, particularly those in polar and mountain regions, may be unable to adapt fast enough. Coral reefs, which support roughly a quarter of all marine life, have already suffered mass bleaching events in three of the past six years. Meanwhile, communities of people living along low-lying coasts are being forced to consider relocation as sea levels creep upward.\n\nGovernments have responded with a patchwork of pledges to reduce emissions, but critics argue that these promises are rarely matched by concrete policy. The gap between rhetoric and action, they say, is where the next generation of environmental damage will be written.\n\nOptimists point to rapid advances in clean energy technology as reason for hope. Solar power, once prohibitively expensive, is now the cheapest source of new electricity in most of the world. Whether such technologies can be deployed at the necessary scale — and quickly enough — remains an open question.",
        "questions": [
          {"id":"2023-e2-text1-q1","stem":"According to the first paragraph, what most concerns scientists about current climate change?","options":["A) The scale of the changes","B) The speed of the changes","C) The variety of ecosystems affected","D) The difficulty of documenting the changes"],"answer":"B","explanation":"首段末句明确指出 'not merely its scale, but its speed'，说明科学家最担心的是变化的速度。"},
          {"id":"2023-e2-text1-q2","stem":"The mention of coral reefs in paragraph 2 serves mainly to","options":["A) illustrate the vulnerability of marine ecosystems","B) argue that ocean chemistry is stable","C) show that adaptation is always possible","D) compare marine and mountain species"],"answer":"A","explanation":"作者以珊瑚礁 'mass bleaching events' 为例，说明海洋生态系统的脆弱。"},
          {"id":"2023-e2-text1-q3","stem":"The critics referred to in paragraph 3 believe that governments","options":["A) have made too few pledges","B) fail to enforce their pledges","C) rely too much on clean energy","D) exaggerate environmental damage"],"answer":"B","explanation":"critics 认为承诺 'rarely matched by concrete policy'——即政府并未落实。"},
          {"id":"2023-e2-text1-q4","stem":"What is the author's attitude toward clean energy technology?","options":["A) Dismissive","B) Uncritical","C) Cautiously hopeful","D) Deeply pessimistic"],"answer":"C","explanation":"末段先肯定 solar 变便宜，随后以 'remains an open question' 保留态度——审慎乐观。"}
        ]
      }],
      "cloze": {
        "id": "2023-e2-cloze",
        "passage": "Reading is one of the oldest ways humans have used to make sense of the world, yet the act itself is far from [1]. Modern research shows that when we read, our brains do more than [2] symbols on a page — they simulate the events, sounds, and even smells described in the text. This kind of mental simulation, some scientists [3], is what allows literature to shape how we think and feel.\n\nInterestingly, the [4] of reading depends heavily on the medium. Studies comparing paper and screens have found that readers tend to [5] information more deeply on paper. The reasons are not fully understood, but they may [6] to how we associate physical space with memory.\n\nDigital reading has its own [7]. It allows instant access to millions of texts and makes it easier for readers to [8] passages, share notes, and follow links. Yet the same features that make digital reading convenient may also [9] our attention, causing us to skim rather than read carefully.\n\nOne consequence is a slow [10] in what scholars call 'deep reading' — the sustained, thoughtful engagement with a text that used to be common. Some educators worry that younger readers, raised on short online posts, may never develop the [11] required for long, complex works.\n\nStill, others [12] optimistic. They point out that people today read more words than ever before, even if the format has changed. What matters, they argue, is not the [13] of the medium but the intention of the reader.\n\nSchools are experimenting with ways to [14] the benefits of both worlds. Some assign digital texts for research and paper books for discussion, [15] the strengths of each. Others train students to switch consciously between skimming and deep reading, treating them as [16] skills.\n\nWhat seems clear is that reading itself is [17]. As new technologies emerge, our habits will continue to shift. Whether this leads to a richer intellectual life or a shallower one may depend less on the tools we use than on how [18] we choose to use them.\n\nUltimately, reading is not simply about [19] information. It is about building a private world inside one's mind — a world that, in the best cases, [20] the reader long after the page has been turned.",
        "blanks": [
          {"index":1,"options":["A) simple","B) obvious","C) recent","D) natural"],"answer":"A"},
          {"index":2,"options":["A) invent","B) decode","C) delete","D) copy"],"answer":"B"},
          {"index":3,"options":["A) doubt","B) deny","C) argue","D) forget"],"answer":"C"},
          {"index":4,"options":["A) speed","B) cost","C) purpose","D) experience"],"answer":"D"},
          {"index":5,"options":["A) reject","B) absorb","C) hide","D) rewrite"],"answer":"B"},
          {"index":6,"options":["A) relate","B) belong","C) return","D) respond"],"answer":"A"},
          {"index":7,"options":["A) rules","B) rivals","C) advantages","D) origins"],"answer":"C"},
          {"index":8,"options":["A) censor","B) translate","C) search","D) print"],"answer":"C"},
          {"index":9,"options":["A) sharpen","B) fragment","C) preserve","D) restore"],"answer":"B"},
          {"index":10,"options":["A) rise","B) growth","C) decline","D) balance"],"answer":"C"},
          {"index":11,"options":["A) patience","B) money","C) courage","D) humor"],"answer":"A"},
          {"index":12,"options":["A) leave","B) grow","C) remain","D) become"],"answer":"C"},
          {"index":13,"options":["A) size","B) format","C) price","D) origin"],"answer":"B"},
          {"index":14,"options":["A) hide","B) reject","C) combine","D) count"],"answer":"C"},
          {"index":15,"options":["A) ignoring","B) recording","C) exploiting","D) copying"],"answer":"C"},
          {"index":16,"options":["A) identical","B) forbidden","C) complementary","D) unnecessary"],"answer":"C"},
          {"index":17,"options":["A) evolving","B) ending","C) fading","D) standing"],"answer":"A"},
          {"index":18,"options":["A) rarely","B) blindly","C) mindfully","D) briefly"],"answer":"C"},
          {"index":19,"options":["A) selling","B) gathering","C) hiding","D) burning"],"answer":"B"},
          {"index":20,"options":["A) leaves","B) empties","C) shortens","D) accompanies"],"answer":"D"}
        ]
      }
    }
  }
]

print(f"Year 2023 data ready. Now appending 2025 English 2...")
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print(f"Wrote {len(data)} year(s) to {OUT}")
