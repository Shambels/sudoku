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
    "file": "real-01-handwritten-paper.webp",
    "board": "..7.4...8.143.....62.1....9..68.....4...1...5..1..42..1....7.56.....39717...913..",
    "tags": [
      "real",
      "handwriting",
      "paper"
    ],
    "notes": "hand-drawn grid on creased paper, phone photo. Stored as the original webp, not re-encoded: a JPEG copy of it reads r1c9 correctly where this does not, and picking the easier copy would be measuring the wrong thing."
  },
  {
    "file": "real-02-printed-pencil.jpg",
    "board": "582..3....46...328.3...8.653587....6614389572279..483186.49.2534238.5....95.3..8.",
    "tags": [
      "real",
      "print",
      "handwriting",
      "dense"
    ],
    "notes": "printed grid, handwritten answers, faint erased-pencil ghosting, 50 clues. Original bytes - re-encoding at q88 turns ghosting into false ink."
  },
  {
    "file": "real-03-newspaper-blurry.jpg",
    "board": "...6.47..7.6.....9.....5.8..7..2..938.......543..1..7..5.2.....3.....2.8..23.1...",
    "tags": [
      "real",
      "print",
      "blur",
      "clutter"
    ],
    "notes": "newspaper puzzle, out of focus, page text above and beside the grid. Original bytes."
  },
  {
    "file": "real-04-gravel-rotated.jpg",
    "board": "..4.8.....1.792.4.3........6.....2...578.1936..3.....8........2.3.964.1....27.6..",
    "tags": [
      "real",
      "print",
      "rotation",
      "perspective",
      "clutter",
      "hard"
    ],
    "notes": "folded newspaper on gravel: rotated ~20 deg, strong perspective, shadow, margin scribbles, low resolution. Original bytes."
  },
  {
    "file": "real-05-newspaper-angle.jpg",
    "board": "....6...24...156.....7...9....6..1.7.7.....8.3.6..9....5...8.....149...38...5....",
    "tags": [
      "real",
      "print",
      "perspective",
      "clutter",
      "two-grids"
    ],
    "notes": "full newspaper page at an angle. A COMPLETED solution grid sits above the puzzle - two valid grids in one frame. Original bytes."
  },
  {
    "file": "syn-01-screenshot-clean-a.jpg",
    "board": ".3..7.128.9...346.71...8.9..27.3.......16.....8.45...6...32..5...5.8...237....8.1",
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
    "board": "...1.5..8.....46.51.36....96...7.......5.3.74..7...5.23...12....8..........438..1",
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
    "board": "9....5.6..3...1825.2....9.3.5....68..7..6.3.1..6.8.75....732...1.....2..7..8....6",
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
    "board": "4.5.3.1..3......9..18..6..52.4.63..1...29...67..8.45...4.1......72......8....9.52",
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
    "board": ".1.89.........3....3.1....2..4..7..1......26.8.75.64.........2.7...29..6...7..8.4",
    "corners": [
      [
        103.7,
        188.5
      ],
      [
        862.3,
        159.8
      ],
      [
        885.1,
        909.5
      ],
      [
        134.6,
        936.0
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
    "board": "..7...89.9...58314.3...9...1...75...4.59...7..7.8..2..7.1......68..9.......4.1.8.",
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
    "board": "....547......1.8.2.4.7....1..74.9....52..14.8......269..8.4.52.1....59.772.98..1.",
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
    "board": ".59..7.1..............13.29.2.3..79..7.2.5....8..6.1.26..........21.85.4.35..2...",
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
    "board": "..7....81.3.......6...47...9.67.8..4.521.43...835......954.26..2..61.......9..45.",
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
    "board": "84.1..6...26.7...3.....8.2....3....83..28.15.4....6........2.1..54813..2..1...58.",
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
    "board": "....1...3.6...5.1..4.6..9..6..4....8.87...5......8...29.5.26......17....136.....7",
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
    "board": "3.2...5.69.83....45...8.9.........782.9..81.......16.2....43.5.8..956....952.....",
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
    "board": ".62...9.34.........379.8...17..9...2.....3.1..2.4..67...43....8.8..........86715.",
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
    "board": ".3..4...14.8.1..769....3...28.3...65.95..6......1.4..98.....65.67.23..9..4.......",
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
    "board": ".3.859....2..176....9..68......3...2.......5.8...25.16..4......3.16..7..6.7.8.23.",
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
    "board": "582.1..7..3....8.5..9.........45...77.3..8.9...8..2......5...4..7.84.6..2946.7.1.",
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
    "board": "..7......835....7.2..8...35.1....4..5..79..619.6.4.7533....7.4..5.4..2.....1.8..6",
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
    "board": "..38..5..9...6.3...25......83..2......4.18.3..7...............77.69..18..4.1.69.2",
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
    "board": ".....3..2..27....456.2.....32..4....9....74.8.7.5.1.2..3...8.5.6...3..9.2...6...3",
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
    "board": ".3.24..8..6....4..1..5.9.2.8.6.31..79...2...87.......9.9.......471.9.8..3524...9.",
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
    "board": "25...697.....3...23.6..2........37......5....9.....5..6.394..85.7....1.94...1....",
    "corners": [
      [
        152.2,
        180.3
      ],
      [
        861.5,
        211.9
      ],
      [
        818.5,
        926.4
      ],
      [
        116.3,
        917.4
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
