// Fixture manifest for test-vision.html. Generated entries tagged
// "synthetic" are rewritten by tools/make_synthetic_fixtures.py;
// hand-added real-photo entries are preserved.
//
// A .js file rather than .json on purpose: a <script> tag loads from
// file://, whereas fetch() of a local .json is blocked by Chrome.
//
// board:   81 chars, row-major, '.' = empty
// corners: grid corners in image pixels, in TL, TR, BR, BL order - omit if unknown
window.SUDOKU_FIXTURES = [
  {
    "file": "syn-01-screenshot-clean-a.jpg",
    "board": ".3..7.128.9.5.346.7....8.9...7.3..1....16.....8.45...6...32..5...5.8..323.....8.1",
    "corners": [
      [
        8.9,
        112.3
      ],
      [
        884.4,
        112.3
      ],
      [
        884.4,
        987.7
      ],
      [
        8.9,
        987.7
      ]
    ],
    "tags": [
      "synthetic",
      "screenshot",
      "print"
    ],
    "notes": "crisp app screenshot"
  },
  {
    "file": "syn-02-screenshot-clean-b.jpg",
    "board": ".....5..8.....46.51.36....96...7.......5.3.74..78..5.2....12.5.28...........38..1",
    "corners": [
      [
        55.3,
        144.4
      ],
      [
        866.5,
        144.4
      ],
      [
        866.5,
        955.6
      ],
      [
        55.3,
        955.6
      ]
    ],
    "tags": [
      "synthetic",
      "screenshot",
      "print"
    ],
    "notes": "screenshot with margin"
  },
  {
    "file": "syn-03-screenshot-inverted.jpg",
    "board": "9....5.6..3....825.2....913.5....68..7..6.341....8.75..6.732...1.....2.....8....6",
    "corners": [
      [
        30.4,
        74.2
      ],
      [
        982.0,
        74.2
      ],
      [
        982.0,
        1025.8
      ],
      [
        30.4,
        1025.8
      ]
    ],
    "tags": [
      "synthetic",
      "screenshot",
      "inverted"
    ],
    "notes": "dark-mode app: white digits on black. KNOWN GAP - the pipeline assumes dark ink."
  },
  {
    "file": "syn-04-flat-print-a.jpg",
    "board": "..5.....83..5...94.18....752.4..3..1...29...67..814523.4.1.......2...........9.52",
    "corners": [
      [
        102.7,
        82.3
      ],
      [
        1014.7,
        103.9
      ],
      [
        989.4,
        1023.1
      ],
      [
        77.3,
        995.8
      ]
    ],
    "tags": [
      "synthetic",
      "print",
      "flat"
    ],
    "notes": "flat scan"
  },
  {
    "file": "syn-05-flat-print-b.jpg",
    "board": ".1............3....3.........4..7...3..9..26.8..5164...4.....2.78..29..6...7..8.4",
    "corners": [
      [
        106.8,
        189.1
      ],
      [
        851.8,
        164.2
      ],
      [
        883.9,
        910.4
      ],
      [
        131.8,
        933.7
      ]
    ],
    "tags": [
      "synthetic",
      "print",
      "flat"
    ],
    "notes": "flat scan, few clues"
  },
  {
    "file": "syn-06-perspective-mild-a.jpg",
    "board": "..7....9.9..758314.3...9...1...7....4.59...7..7.81.2.97.1......6....7......4.1.8.",
    "corners": [
      [
        103.0,
        74.9
      ],
      [
        960.1,
        164.0
      ],
      [
        916.8,
        1018.3
      ],
      [
        69.0,
        936.0
      ]
    ],
    "tags": [
      "synthetic",
      "print",
      "perspective"
    ],
    "notes": ""
  },
  {
    "file": "syn-07-perspective-mild-b.jpg",
    "board": ".....47......1.8.2.4.7....16.74.9....52..14.8......269..8.4.52.1.....9.772598..1.",
    "corners": [
      [
        69.2,
        215.9
      ],
      [
        813.3,
        135.3
      ],
      [
        900.8,
        890.2
      ],
      [
        108.9,
        969.0
      ]
    ],
    "tags": [
      "synthetic",
      "print",
      "perspective"
    ],
    "notes": ""
  },
  {
    "file": "syn-08-perspective-strong-a.jpg",
    "board": ".5...7.1..............13.29.2.3..79..7.2.5....8..6.1.26.8.......921.85.4..5..2...",
    "corners": [
      [
        213.4,
        44.2
      ],
      [
        974.7,
        203.8
      ],
      [
        899.6,
        989.0
      ],
      [
        89.0,
        953.5
      ]
    ],
    "tags": [
      "synthetic",
      "print",
      "perspective",
      "hard"
    ],
    "notes": ""
  },
  {
    "file": "syn-09-perspective-strong-b.jpg",
    "board": "..7.....1.3.....4.6...47...9.67.8.24.521.43...835....9.954.2...2..6........9..45.",
    "corners": [
      [
        91.7,
        251.2
      ],
      [
        842.8,
        197.1
      ],
      [
        856.2,
        870.5
      ],
      [
        214.3,
        912.1
      ]
    ],
    "tags": [
      "synthetic",
      "print",
      "perspective",
      "hard"
    ],
    "notes": ""
  },
  {
    "file": "syn-10-rotated-a.jpg",
    "board": "8431..6...26.....3.....8.2....3....83..28.15.4....6........2.1..54813..2..1...58.",
    "corners": [
      [
        226.2,
        181.6
      ],
      [
        823.7,
        313.1
      ],
      [
        693.6,
        917.8
      ],
      [
        80.1,
        779.7
      ]
    ],
    "tags": [
      "synthetic",
      "print",
      "rotation"
    ],
    "notes": ""
  },
  {
    "file": "syn-11-rotated-b.jpg",
    "board": ".5..14....6........4....9..6..4....8.87...54.....8...29...26....2.17....136.4...7",
    "corners": [
      [
        77.1,
        355.2
      ],
      [
        651.4,
        190.1
      ],
      [
        816.1,
        754.3
      ],
      [
        242.1,
        908.7
      ]
    ],
    "tags": [
      "synthetic",
      "print",
      "rotation"
    ],
    "notes": ""
  },
  {
    "file": "syn-12-shadow-a.jpg",
    "board": "3.2...5.69..3....45..78.9.........782.96.8........16.2....4..5982.95.....95...8..",
    "corners": [
      [
        101.5,
        93.1
      ],
      [
        996.1,
        120.4
      ],
      [
        975.9,
        996.4
      ],
      [
        91.7,
        989.9
      ]
    ],
    "tags": [
      "synthetic",
      "print",
      "lighting",
      "hard"
    ],
    "notes": ""
  },
  {
    "file": "syn-13-shadow-b.jpg",
    "board": "......9............379.8...17..9...2.4...3.1..2.48.67..54319..8.8..........867.5.",
    "corners": [
      [
        70.6,
        113.2
      ],
      [
        929.5,
        122.8
      ],
      [
        968.4,
        957.6
      ],
      [
        148.9,
        1013.3
      ]
    ],
    "tags": [
      "synthetic",
      "print",
      "lighting",
      "hard"
    ],
    "notes": ""
  },
  {
    "file": "syn-14-blurred.jpg",
    "board": ".3......14.8.1..7691.7.3...28.3...65.95..6......1.4..98.....65.67.2.5....4.......",
    "corners": [
      [
        106.1,
        183.2
      ],
      [
        833.8,
        196.4
      ],
      [
        799.2,
        938.7
      ],
      [
        60.8,
        905.3
      ]
    ],
    "tags": [
      "synthetic",
      "print",
      "blur"
    ],
    "notes": ""
  },
  {
    "file": "syn-15-low-contrast.jpg",
    "board": ".3.8591...2..176.......68......3..........35.8...25.162.4......3.16..7..6.7...23.",
    "corners": [
      [
        72.0,
        169.9
      ],
      [
        853.4,
        148.4
      ],
      [
        890.9,
        914.7
      ],
      [
        123.9,
        936.4
      ]
    ],
    "tags": [
      "synthetic",
      "print",
      "lighting",
      "hard"
    ],
    "notes": ""
  },
  {
    "file": "syn-16-page-curl.jpg",
    "board": "582.1..7..37...8.5..9..........5...77.3..8.....8.72.....15...4..7.84.6...946.7.1.",
    "corners": [
      [
        134.6,
        132.0
      ],
      [
        976.8,
        143.1
      ],
      [
        948.1,
        984.0
      ],
      [
        125.4,
        965.4
      ]
    ],
    "tags": [
      "synthetic",
      "print",
      "curl",
      "hard"
    ],
    "notes": ""
  },
  {
    "file": "syn-17-book-gutter.jpg",
    "board": "..7......835....7.2.98...35......4..5..793.619.6.4.7.33....754..5.4..2.......8..6",
    "corners": [
      [
        89.7,
        144.4
      ],
      [
        932.3,
        138.0
      ],
      [
        965.7,
        933.3
      ],
      [
        125.5,
        982.6
      ]
    ],
    "tags": [
      "synthetic",
      "print",
      "lighting",
      "hard"
    ],
    "notes": ""
  },
  {
    "file": "syn-18-noisy-jpeg.jpg",
    "board": "..389.5..9.........25...7..83..2....5.4.18...2.........9......77.69..1.....1769.2",
    "corners": [
      [
        133.1,
        60.3
      ],
      [
        976.9,
        155.0
      ],
      [
        923.4,
        1003.4
      ],
      [
        98.7,
        905.1
      ]
    ],
    "tags": [
      "synthetic",
      "print",
      "noise"
    ],
    "notes": ""
  },
  {
    "file": "syn-19-handwriting-a.jpg",
    "board": "....53.....27...3456.2.....32..4.17.9..3.74.8...5.1.2..3.....5.....3..9.2...6....",
    "corners": [
      [
        113.8,
        172.4
      ],
      [
        827.0,
        190.5
      ],
      [
        797.7,
        917.7
      ],
      [
        74.7,
        920.4
      ]
    ],
    "tags": [
      "synthetic",
      "handwriting",
      "pseudo"
    ],
    "notes": ""
  },
  {
    "file": "syn-20-handwriting-b.jpg",
    "board": ".3.24..8..6....4..1..5.9.2.8.69....791...4..87.......9.9.......471.9.8..3524...9.",
    "corners": [
      [
        110.6,
        215.7
      ],
      [
        879.5,
        102.7
      ],
      [
        930.3,
        882.5
      ],
      [
        162.4,
        990.6
      ]
    ],
    "tags": [
      "synthetic",
      "handwriting",
      "pseudo",
      "hard"
    ],
    "notes": ""
  },
  {
    "file": "syn-21-handwriting-curl.jpg",
    "board": "2....6.7.....3......6..2...1.5.237......5....9........6.394.285.7..6.1.9....15...",
    "corners": [
      [
        148.0,
        184.1
      ],
      [
        896.7,
        202.3
      ],
      [
        865.6,
        945.2
      ],
      [
        100.3,
        900.4
      ]
    ],
    "tags": [
      "synthetic",
      "handwriting",
      "pseudo",
      "curl",
      "hard"
    ],
    "notes": ""
  }
];
