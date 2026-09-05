export const CROP_PROFILES = {
  wheat: {
    category: "cereal",
    totalNPK: { N: 120, P: 60, K: 40 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.3, P: 0.5, K: 0.3 },
      vegetative: { N: 0.4, P: 0.3, K: 0.4 },
      reproductive: { N: 0.3, P: 0.2, K: 0.3 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.55, reproductive: 0.75
    }
  },
  sugarcane: {
    category: "cereal",
    totalNPK: { N: 200, P: 80, K: 80 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.3, P: 0.5, K: 0.3 },
      vegetative: { N: 0.4, P: 0.3, K: 0.4 },
      reproductive: { N: 0.3, P: 0.2, K: 0.3 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.55, reproductive: 0.75
    }
  },
  rice: {
    category: "cereal",
    totalNPK: { N: 120, P: 60, K: 40 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.2, P: 0.5, K: 0.3 },
      vegetative: { N: 0.5, P: 0.3, K: 0.4 },
      reproductive: { N: 0.3, P: 0.2, K: 0.3 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.55, reproductive: 0.75
    }
  },
  soybean: {
    category: "oilseed",
    totalNPK: { N: 20, P: 80, K: 40 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.55, reproductive: 0.75
    }
  },
  corn: {
    category: "cereal",
    totalNPK: { N: 135, P: 62.5, K: 50 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.3, P: 0.5, K: 0.3 },
      vegetative: { N: 0.4, P: 0.3, K: 0.4 },
      reproductive: { N: 0.3, P: 0.2, K: 0.3 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.55, reproductive: 0.75
    }
  },
  cotton: {
    category: "oilseed",
    totalNPK: { N: 120, P: 60, K: 60 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.55, reproductive: 0.75
    }
  },
  groundnut: {
    category: "oilseed",
    totalNPK: { N: 25, P: 50, K: 75 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.55, reproductive: 0.75
    }
  },
  chickpea: {
    category: "pulse",
    totalNPK: { N: 20, P: 50, K: 10 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.5, reproductive: 0.7
    }
  },
  greengram: {
    category: "pulse",
    totalNPK: { N: 25, P: 50, K: 0 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.5, reproductive: 0.7
    }
  },
  kidneybeansrajma: {
    category: "pulse",
    totalNPK: { N: 100, P: 60, K: 20 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.5, reproductive: 0.7
    }
  },
  redgram: {
    category: "pulse",
    totalNPK: { N: 25, P: 50, K: 0 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.5, reproductive: 0.7
    }
  },
  grapes: {
    category: "fruit",
    totalNPK: { N: 500, P: 300, K: 600 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  banana: {
    category: "fruit",
    totalNPK: { N: 150, P: 60, K: 300 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  papaya: {
    category: "fruit",
    totalNPK: { N: 250, P: 250, K: 250 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  guava: {
    category: "fruit",
    totalNPK: { N: 278, P: 278, K: 278 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  pomegranate: {
    category: "fruit",
    totalNPK: { N: 240, P: 200, K: 480 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  watermelon: {
    category: "fruit",
    totalNPK: { N: 100, P: 50, K: 50 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  orange: {
    category: "fruit",
    totalNPK: { N: 300, P: 100, K: 150 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  sapota: {
    category: "fruit",
    totalNPK: { N: 500, P: 500, K: 750 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  mango: {
    category: "fruit",
    totalNPK: { N: 100, P: 100, K: 150 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  muskmelon: {
    category: "fruit",
    totalNPK: { N: 100, P: 50, K: 50 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  fig: {
    category: "fruit",
    totalNPK: { N: 200, P: 100, K: 200 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  coriander: {
    category: "vegetable",
    totalNPK: { N: 10, P: 40, K: 20 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  turmeric: {
    category: "vegetable",
    totalNPK: { N: 60, P: 60, K: 108 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  ginger: {
    category: "vegetable",
    totalNPK: { N: 75, P: 50, K: 50 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  ashgourd: {
    category: "vegetable",
    totalNPK: { N: 100, P: 50, K: 50 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  beetroot: {
    category: "vegetable",
    totalNPK: { N: 80, P: 40, K: 40 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  bittergourd: {
    category: "vegetable",
    totalNPK: { N: 70, P: 25, K: 25 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  bottlegourd: {
    category: "vegetable",
    totalNPK: { N: 100, P: 50, K: 50 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  brinjal: {
    category: "vegetable",
    totalNPK: { N: 100, P: 50, K: 50 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  broccoli: {
    category: "vegetable",
    totalNPK: { N: 120, P: 60, K: 60 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  cabbage: {
    category: "vegetable",
    totalNPK: { N: 120, P: 60, K: 60 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  capsicum: {
    category: "vegetable",
    totalNPK: { N: 120, P: 60, K: 60 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  carrot: {
    category: "vegetable",
    totalNPK: { N: 80, P: 40, K: 40 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  cauliflower: {
    category: "vegetable",
    totalNPK: { N: 120, P: 60, K: 60 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  celery: {
    category: "vegetable",
    totalNPK: { N: 100, P: 50, K: 50 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  cucumber: {
    category: "vegetable",
    totalNPK: { N: 60, P: 30, K: 30 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  garlic: {
    category: "vegetable",
    totalNPK: { N: 50, P: 50, K: 50 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  onion: {
    category: "vegetable",
    totalNPK: { N: 60, P: 40, K: 40 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  lettuce: {
    category: "vegetable",
    totalNPK: { N: 100, P: 50, K: 50 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  longmelon: {
    category: "vegetable",
    totalNPK: { N: 100, P: 50, K: 50 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  mushroom: {
    category: "vegetable",
    totalNPK: { N: 0, P: 0, K: 0 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0, P: 0, K: 0 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  okra: {
    category: "vegetable",
    totalNPK: { N: 110, P: 35, K: 70 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  greenpeas: {
    category: "pulse",
    totalNPK: { N: 20, P: 40, K: 20 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.5, reproductive: 0.7
    }
  },
  potato: {
    category: "vegetable",
    totalNPK: { N: 120, P: 60, K: 60 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  pumpkin: {
    category: "vegetable",
    totalNPK: { N: 60, P: 30, K: 30 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  radish: {
    category: "vegetable",
    totalNPK: { N: 50, P: 25, K: 25 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  spinach: {
    category: "vegetable",
    totalNPK: { N: 60, P: 30, K: 30 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  spongegourd: {
    category: "vegetable",
    totalNPK: { N: 100, P: 50, K: 50 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  squashmelon: {
    category: "vegetable",
    totalNPK: { N: 60, P: 30, K: 30 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  summersquash: {
    category: "vegetable",
    totalNPK: { N: 60, P: 30, K: 30 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  sweetpotato: {
    category: "vegetable",
    totalNPK: { N: 75, P: 50, K: 75 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  tomato: {
    category: "vegetable",
    totalNPK: { N: 200, P: 250, K: 100 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  turnip: {
    category: "vegetable",
    totalNPK: { N: 80, P: 40, K: 40 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  tobacco: {
    category: "vegetable",
    totalNPK: { N: 50, P: 50, K: 50 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  barley: {
    category: "cereal",
    totalNPK: { N: 60, P: 30, K: 20 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.3, P: 0.5, K: 0.3 },
      vegetative: { N: 0.4, P: 0.3, K: 0.4 },
      reproductive: { N: 0.3, P: 0.2, K: 0.3 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.55, reproductive: 0.75
    }
  },
  pearlmillet: {
    category: "cereal",
    totalNPK: { N: 70, P: 35, K: 35 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.3, P: 0.5, K: 0.3 },
      vegetative: { N: 0.4, P: 0.3, K: 0.4 },
      reproductive: { N: 0.3, P: 0.2, K: 0.3 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.55, reproductive: 0.75
    }
  },
  sorghum: {
    category: "cereal",
    totalNPK: { N: 90, P: 45, K: 45 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.3, P: 0.5, K: 0.3 },
      vegetative: { N: 0.4, P: 0.3, K: 0.4 },
      reproductive: { N: 0.3, P: 0.2, K: 0.3 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.55, reproductive: 0.75
    }
  },
  fingermillet: {
    category: "cereal",
    totalNPK: { N: 60, P: 30, K: 30 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.3, P: 0.5, K: 0.3 },
      vegetative: { N: 0.4, P: 0.3, K: 0.4 },
      reproductive: { N: 0.3, P: 0.2, K: 0.3 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.55, reproductive: 0.75
    }
  },
  blackgram: {
    category: "pulse",
    totalNPK: { N: 25, P: 50, K: 0 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.5, reproductive: 0.7
    }
  },
  lentil: {
    category: "pulse",
    totalNPK: { N: 20, P: 40, K: 20 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.5, reproductive: 0.7
    }
  },
  horsegram: {
    category: "pulse",
    totalNPK: { N: 12.5, P: 25, K: 0 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.5, reproductive: 0.7
    }
  },
  cowpealobia: {
    category: "pulse",
    totalNPK: { N: 25, P: 50, K: 0 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.5, reproductive: 0.7
    }
  },
  mustard: {
    category: "oilseed",
    totalNPK: { N: 60, P: 30, K: 20 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.55, reproductive: 0.75
    }
  },
  sunflower: {
    category: "oilseed",
    totalNPK: { N: 60, P: 90, K: 30 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.55, reproductive: 0.75
    }
  },
  sesame: {
    category: "oilseed",
    totalNPK: { N: 30, P: 15, K: 15 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.55, reproductive: 0.75
    }
  },
  linseed: {
    category: "oilseed",
    totalNPK: { N: 60, P: 30, K: 30 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.55, reproductive: 0.75
    }
  },
  castor: {
    category: "oilseed",
    totalNPK: { N: 90, P: 45, K: 45 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.55, reproductive: 0.75
    }
  },
  safflower: {
    category: "oilseed",
    totalNPK: { N: 40, P: 20, K: 20 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.55, reproductive: 0.75
    }
  },
  niger: {
    category: "oilseed",
    totalNPK: { N: 40, P: 20, K: 0 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.55, reproductive: 0.75
    }
  },
  jute: {
    category: "cereal",
    totalNPK: { N: 60, P: 30, K: 30 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.3, P: 0.5, K: 0.3 },
      vegetative: { N: 0.4, P: 0.3, K: 0.4 },
      reproductive: { N: 0.3, P: 0.2, K: 0.3 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.55, reproductive: 0.75
    }
  },
  beans: {
    category: "pulse",
    totalNPK: { N: 20, P: 40, K: 20 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.5, reproductive: 0.7
    }
  },
  apple: {
    category: "fruit",
    totalNPK: { N: 70, P: 35, K: 70 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  lemon: {
    category: "fruit",
    totalNPK: { N: 300, P: 100, K: 150 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  pineapple: {
    category: "fruit",
    totalNPK: { N: 320, P: 160, K: 320 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  cumin: {
    category: "vegetable",
    totalNPK: { N: 30, P: 20, K: 20 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  blackpepper: {
    category: "fruit",
    totalNPK: { N: 100, P: 100, K: 300 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  tea: {
    category: "fruit",
    totalNPK: { N: 300, P: 100, K: 300 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  coffee: {
    category: "fruit",
    totalNPK: { N: 120, P: 90, K: 120 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  coconut: {
    category: "fruit",
    totalNPK: { N: 220, P: 140, K: 530 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  arecanut: {
    category: "fruit",
    totalNPK: { N: 136, P: 55, K: 191 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  rubber: {
    category: "fruit",
    totalNPK: { N: 80, P: 80, K: 65 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  dragonfruit: {
    category: "fruit",
    totalNPK: { N: 200, P: 100, K: 200 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  snakegourd: {
    category: "vegetable",
    totalNPK: { N: 100, P: 50, K: 50 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  drumstick: {
    category: "vegetable",
    totalNPK: { N: 100, P: 50, K: 50 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  chilli: {
    category: "vegetable",
    totalNPK: { N: 120, P: 60, K: 60 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  chia: {
    category: "oilseed",
    totalNPK: { N: 40, P: 20, K: 20 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.55, reproductive: 0.75
    }
  },
  kiwi: {
    category: "fruit",
    totalNPK: { N: 700, P: 400, K: 650 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  amla: {
    category: "fruit",
    totalNPK: { N: 200, P: 500, K: 200 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  fenugreekmethi: {
    category: "vegetable",
    totalNPK: { N: 30, P: 20, K: 20 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  pecannuts: {
    category: "nut",
    totalNPK: { N: 200, P: 80, K: 180 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  macadamianuts: {
    category: "nut",
    totalNPK: { N: 250, P: 120, K: 400 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  almond: {
    category: "nut",
    totalNPK: { N: 250, P: 100, K: 250 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  walnut: {
    category: "nut",
    totalNPK: { N: 280, P: 100, K: 200 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  cashew: {
    category: "nut",
    totalNPK: { N: 100, P: 50, K: 100 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  pistachio: {
    category: "nut",
    totalNPK: { N: 200, P: 80, K: 180 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  hazelnut: {
    category: "nut",
    totalNPK: { N: 150, P: 60, K: 120 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  chestnut: {
    category: "nut",
    totalNPK: { N: 120, P: 60, K: 120 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  brazilnut: {
    category: "nut",
    totalNPK: { N: 80, P: 40, K: 80 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  pinenut: {
    category: "nut",
    totalNPK: { N: 60, P: 30, K: 60 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  pears: {
    category: "fruit",
    totalNPK: { N: 80, P: 40, K: 80 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  winegrapes: {
    category: "fruit",
    totalNPK: { N: 350, P: 200, K: 450 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  tablegrapes: {
    category: "fruit",
    totalNPK: { N: 550, P: 300, K: 700 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  citrus: {
    category: "fruit",
    totalNPK: { N: 300, P: 100, K: 150 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  cherry: {
    category: "fruit",
    totalNPK: { N: 150, P: 75, K: 150 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  peach: {
    category: "fruit",
    totalNPK: { N: 180, P: 90, K: 180 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  avocado: {
    category: "fruit",
    totalNPK: { N: 250, P: 150, K: 400 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  olive: {
    category: "fruit",
    totalNPK: { N: 150, P: 60, K: 150 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  plum: {
    category: "fruit",
    totalNPK: { N: 150, P: 75, K: 150 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  apricot: {
    category: "fruit",
    totalNPK: { N: 150, P: 75, K: 150 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  nectarine: {
    category: "fruit",
    totalNPK: { N: 180, P: 90, K: 180 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  blueberry: {
    category: "fruit",
    totalNPK: { N: 120, P: 40, K: 100 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  raspberry: {
    category: "fruit",
    totalNPK: { N: 100, P: 50, K: 150 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  blackberry: {
    category: "fruit",
    totalNPK: { N: 100, P: 50, K: 150 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  cranberry: {
    category: "fruit",
    totalNPK: { N: 60, P: 30, K: 80 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  persimmon: {
    category: "fruit",
    totalNPK: { N: 150, P: 75, K: 120 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  lychee: {
    category: "fruit",
    totalNPK: { N: 500, P: 250, K: 500 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  rambutan: {
    category: "fruit",
    totalNPK: { N: 400, P: 200, K: 400 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  durian: {
    category: "fruit",
    totalNPK: { N: 500, P: 250, K: 600 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  jackfruit: {
    category: "fruit",
    totalNPK: { N: 400, P: 200, K: 400 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  custardapple: {
    category: "fruit",
    totalNPK: { N: 200, P: 100, K: 200 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  passionfruit: {
    category: "fruit",
    totalNPK: { N: 150, P: 80, K: 200 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  starfruit: {
    category: "fruit",
    totalNPK: { N: 300, P: 150, K: 300 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  datepalm: {
    category: "fruit",
    totalNPK: { N: 200, P: 100, K: 300 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  cacaococoa: {
    category: "fruit",
    totalNPK: { N: 150, P: 60, K: 150 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  vanilla: {
    category: "fruit",
    totalNPK: { N: 80, P: 40, K: 100 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  oilpalm: {
    category: "fruit",
    totalNPK: { N: 250, P: 100, K: 400 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  oats: {
    category: "cereal",
    totalNPK: { N: 60, P: 30, K: 20 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.3, P: 0.5, K: 0.3 },
      vegetative: { N: 0.4, P: 0.3, K: 0.4 },
      reproductive: { N: 0.3, P: 0.2, K: 0.3 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.55, reproductive: 0.75
    }
  },
  rye: {
    category: "cereal",
    totalNPK: { N: 60, P: 30, K: 20 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.3, P: 0.5, K: 0.3 },
      vegetative: { N: 0.4, P: 0.3, K: 0.4 },
      reproductive: { N: 0.3, P: 0.2, K: 0.3 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.55, reproductive: 0.75
    }
  },
  triticale: {
    category: "cereal",
    totalNPK: { N: 90, P: 45, K: 30 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.3, P: 0.5, K: 0.3 },
      vegetative: { N: 0.4, P: 0.3, K: 0.4 },
      reproductive: { N: 0.3, P: 0.2, K: 0.3 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.55, reproductive: 0.75
    }
  },
  teff: {
    category: "cereal",
    totalNPK: { N: 50, P: 25, K: 20 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.3, P: 0.5, K: 0.3 },
      vegetative: { N: 0.4, P: 0.3, K: 0.4 },
      reproductive: { N: 0.3, P: 0.2, K: 0.3 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.55, reproductive: 0.75
    }
  },
  buckwheat: {
    category: "cereal",
    totalNPK: { N: 35, P: 25, K: 20 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.3, P: 0.5, K: 0.3 },
      vegetative: { N: 0.4, P: 0.3, K: 0.4 },
      reproductive: { N: 0.3, P: 0.2, K: 0.3 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.55, reproductive: 0.75
    }
  },
  amaranthgrain: {
    category: "cereal",
    totalNPK: { N: 60, P: 30, K: 30 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.3, P: 0.5, K: 0.3 },
      vegetative: { N: 0.4, P: 0.3, K: 0.4 },
      reproductive: { N: 0.3, P: 0.2, K: 0.3 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.55, reproductive: 0.75
    }
  },
  quinoa: {
    category: "cereal",
    totalNPK: { N: 70, P: 40, K: 30 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.3, P: 0.5, K: 0.3 },
      vegetative: { N: 0.4, P: 0.3, K: 0.4 },
      reproductive: { N: 0.3, P: 0.2, K: 0.3 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.55, reproductive: 0.75
    }
  },
  canolarapeseed: {
    category: "oilseed",
    totalNPK: { N: 80, P: 40, K: 30 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.55, reproductive: 0.75
    }
  },
  hemp: {
    category: "oilseed",
    totalNPK: { N: 100, P: 45, K: 60 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.55, reproductive: 0.75
    }
  },
  sugarbeet: {
    category: "vegetable",
    totalNPK: { N: 120, P: 60, K: 60 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  guarclusterbean: {
    category: "pulse",
    totalNPK: { N: 20, P: 40, K: 0 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.5, reproductive: 0.7
    }
  },
  lucernealfalfa: {
    category: "forage",
    totalNPK: { N: 25, P: 60, K: 40 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.5, reproductive: 0.7
    }
  },
  berseem: {
    category: "forage",
    totalNPK: { N: 25, P: 60, K: 30 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.5, reproductive: 0.7
    }
  },
  feedsorghum: {
    category: "forage",
    totalNPK: { N: 90, P: 45, K: 45 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.3, P: 0.5, K: 0.3 },
      vegetative: { N: 0.4, P: 0.3, K: 0.4 },
      reproductive: { N: 0.3, P: 0.2, K: 0.3 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.55, reproductive: 0.75
    }
  },
  napiergrass: {
    category: "forage",
    totalNPK: { N: 180, P: 60, K: 60 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.3, P: 0.5, K: 0.3 },
      vegetative: { N: 0.4, P: 0.3, K: 0.4 },
      reproductive: { N: 0.3, P: 0.2, K: 0.3 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.55, reproductive: 0.75
    }
  },
  covercrop: {
    category: "forage",
    totalNPK: { N: 15, P: 15, K: 10 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.5, reproductive: 0.7
    }
  },

  /* ===================== New crops (65-crop expansion: flowers, herbs, spices, plantation & more) ===================== */
  rose: {
    category: "flower",
    totalNPK: { N: 200, P: 100, K: 200 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  marigold: {
    category: "flower",
    totalNPK: { N: 100, P: 75, K: 75 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  jasmine: {
    category: "flower",
    totalNPK: { N: 120, P: 80, K: 120 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  chrysanthemum: {
    category: "flower",
    totalNPK: { N: 150, P: 100, K: 150 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  tuberose: {
    category: "flower",
    totalNPK: { N: 200, P: 150, K: 200 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  hibiscus: {
    category: "flower",
    totalNPK: { N: 100, P: 60, K: 100 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  gerbera: {
    category: "flower",
    totalNPK: { N: 250, P: 150, K: 300 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  carnation: {
    category: "flower",
    totalNPK: { N: 250, P: 150, K: 300 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  gladiolus: {
    category: "flower",
    totalNPK: { N: 200, P: 150, K: 200 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  orchid: {
    category: "flower",
    totalNPK: { N: 150, P: 100, K: 150 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  anthurium: {
    category: "flower",
    totalNPK: { N: 150, P: 100, K: 200 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  lily: {
    category: "flower",
    totalNPK: { N: 200, P: 120, K: 250 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  tulip: {
    category: "flower",
    totalNPK: { N: 120, P: 80, K: 150 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  dahlia: {
    category: "flower",
    totalNPK: { N: 150, P: 100, K: 150 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  aster: {
    category: "flower",
    totalNPK: { N: 100, P: 75, K: 100 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  lavender: {
    category: "flower",
    totalNPK: { N: 60, P: 40, K: 80 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  zinnia: {
    category: "flower",
    totalNPK: { N: 100, P: 60, K: 80 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  petunia: {
    category: "flower",
    totalNPK: { N: 100, P: 80, K: 120 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  poinsettia: {
    category: "flower",
    totalNPK: { N: 150, P: 100, K: 200 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  basil: {
    category: "herb",
    totalNPK: { N: 100, P: 50, K: 50 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  mint: {
    category: "herb",
    totalNPK: { N: 120, P: 60, K: 60 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  lemongrass: {
    category: "herb",
    totalNPK: { N: 150, P: 50, K: 50 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  aloevera: {
    category: "herb",
    totalNPK: { N: 80, P: 40, K: 60 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  stevia: {
    category: "herb",
    totalNPK: { N: 100, P: 60, K: 80 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  ashwagandha: {
    category: "herb",
    totalNPK: { N: 40, P: 30, K: 20 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  rosemary: {
    category: "herb",
    totalNPK: { N: 80, P: 50, K: 80 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  thyme: {
    category: "herb",
    totalNPK: { N: 80, P: 50, K: 70 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  oregano: {
    category: "herb",
    totalNPK: { N: 90, P: 50, K: 70 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  chamomile: {
    category: "herb",
    totalNPK: { N: 60, P: 40, K: 50 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  cardamom: {
    category: "spice",
    totalNPK: { N: 75, P: 75, K: 150 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  clove: {
    category: "spice",
    totalNPK: { N: 100, P: 50, K: 150 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  nutmeg: {
    category: "spice",
    totalNPK: { N: 100, P: 60, K: 150 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  cinnamon: {
    category: "spice",
    totalNPK: { N: 100, P: 50, K: 100 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  saffron: {
    category: "spice",
    totalNPK: { N: 60, P: 40, K: 50 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  staranise: {
    category: "spice",
    totalNPK: { N: 100, P: 50, K: 120 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  cassava: {
    category: "vegetable",
    totalNPK: { N: 100, P: 50, K: 150 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  taro: {
    category: "vegetable",
    totalNPK: { N: 90, P: 50, K: 120 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  yam: {
    category: "vegetable",
    totalNPK: { N: 100, P: 60, K: 150 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  arrowroot: {
    category: "vegetable",
    totalNPK: { N: 80, P: 50, K: 100 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  asparagus: {
    category: "vegetable",
    totalNPK: { N: 120, P: 60, K: 120 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  artichoke: {
    category: "vegetable",
    totalNPK: { N: 150, P: 80, K: 150 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  kale: {
    category: "vegetable",
    totalNPK: { N: 120, P: 60, K: 80 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  brusselssprouts: {
    category: "vegetable",
    totalNPK: { N: 150, P: 75, K: 120 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  leek: {
    category: "vegetable",
    totalNPK: { N: 120, P: 60, K: 100 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  fennel: {
    category: "vegetable",
    totalNPK: { N: 100, P: 60, K: 80 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  bokchoy: {
    category: "vegetable",
    totalNPK: { N: 100, P: 50, K: 70 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  },
  mandarin: {
    category: "fruit",
    totalNPK: { N: 300, P: 100, K: 150 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  pomelo: {
    category: "fruit",
    totalNPK: { N: 300, P: 100, K: 180 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  mangosteen: {
    category: "fruit",
    totalNPK: { N: 200, P: 100, K: 250 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  soursop: {
    category: "fruit",
    totalNPK: { N: 150, P: 80, K: 180 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  tamarind: {
    category: "fruit",
    totalNPK: { N: 150, P: 80, K: 150 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  longan: {
    category: "fruit",
    totalNPK: { N: 400, P: 200, K: 400 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  breadfruit: {
    category: "fruit",
    totalNPK: { N: 150, P: 80, K: 200 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  redcurrant: {
    category: "fruit",
    totalNPK: { N: 80, P: 40, K: 120 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  gooseberry: {
    category: "fruit",
    totalNPK: { N: 80, P: 40, K: 120 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  elderberry: {
    category: "fruit",
    totalNPK: { N: 80, P: 50, K: 100 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  fababean: {
    category: "pulse",
    totalNPK: { N: 25, P: 60, K: 40 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.5, reproductive: 0.7
    }
  },
  limabean: {
    category: "pulse",
    totalNPK: { N: 20, P: 50, K: 40 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.5, reproductive: 0.7
    }
  },
  adzukibean: {
    category: "pulse",
    totalNPK: { N: 20, P: 50, K: 30 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.5, reproductive: 0.7
    }
  },
  lupin: {
    category: "pulse",
    totalNPK: { N: 20, P: 60, K: 50 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.5, P: 0.8, K: 0.5 },
      vegetative: { N: 0.5, P: 0.2, K: 0.5 },
      reproductive: { N: 0, P: 0, K: 0 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.5, reproductive: 0.7
    }
  },
  kenaf: {
    category: "cereal",
    totalNPK: { N: 90, P: 45, K: 45 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.3, P: 0.5, K: 0.3 },
      vegetative: { N: 0.4, P: 0.3, K: 0.4 },
      reproductive: { N: 0.3, P: 0.2, K: 0.3 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.55, reproductive: 0.75
    }
  },
  sisal: {
    category: "cereal",
    totalNPK: { N: 80, P: 40, K: 80 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.3, P: 0.5, K: 0.3 },
      vegetative: { N: 0.4, P: 0.3, K: 0.4 },
      reproductive: { N: 0.3, P: 0.2, K: 0.3 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.55, reproductive: 0.75
    }
  },
  flaxfiber: {
    category: "cereal",
    totalNPK: { N: 60, P: 40, K: 50 },
    maturityBBCH: 90,
    stageSplit: {
      early: { N: 0.3, P: 0.5, K: 0.3 },
      vegetative: { N: 0.4, P: 0.3, K: 0.4 },
      reproductive: { N: 0.3, P: 0.2, K: 0.3 }
    },
    ndviExpected: {
      early: 0.4, vegetative: 0.55, reproductive: 0.75
    }
  },
  yerbamate: {
    category: "plantation",
    totalNPK: { N: 120, P: 60, K: 120 },
    maturityBBCH: 85,
    stageSplit: {
      vegetative: { N: 0.4, P: 0.4, K: 0.4 },
      fruiting: { N: 0.4, P: 0.4, K: 0.6 }
    },
    ndviExpected: {
      vegetative: 0.55, fruiting: 0.65
    }
  },
  chicory: {
    category: "vegetable",
    totalNPK: { N: 100, P: 50, K: 100 },
    maturityBBCH: 90,
    stageSplit: {
      vegetative: { N: 0.5, P: 0.8, K: 0.5 },
      reproductive: { N: 0.5, P: 0.2, K: 0.5 }
    },
    ndviExpected: {
      vegetative: 0.55, reproductive: 0.75
    }
  }
};

/*
 * Crop-encyclopedia name aliases — normalizeCropName() strips spaces/parens,
 * so a Crop doc's display cropName can normalize to something that doesn't
 * match its profile key above (e.g. "fenugreek" -> "fenugreek" vs the
 * profile's "fenugreekmethi"). Without these, calculateNPKFromfarmField()
 * throws "Crop not supported" for any field using these exact display
 * names, which crashes the whole advisory pipeline for that field/crop.
 */
CROP_PROFILES.fenugreek = CROP_PROFILES.fenugreekmethi; // Crop doc: "Fenugreek"
CROP_PROFILES.citrusgeneric = CROP_PROFILES.citrus; // Crop doc: "Citrus (Generic)"
CROP_PROFILES.covercropgenericmix = CROP_PROFILES.covercrop; // Crop doc: "Cover Crop (Generic Mix)"