// 카드 공방에서 내보낸 데이터. 이 파일만 갈아 끼우면 카드·적·재료가 바뀐다.
// 갈아 끼우는 법: python3 tools/import_data.py 내보낸파일.json
const GAME_DATA = {
 "version": 1,
 "cards": [
  {
   "id": "arrow",
   "effect": "이동속도 거리 내 단일대상 공격력 60% 피해",
   "kind": "reward",
   "name": "화살",
   "note": "",
   "tags": [
    "attack",
    "ranged"
   ],
   "memo": [],
   "upgrades": [],
   "costs": [
    {
     "energy": 1
    },
    {
     "mana": 1
    }
   ]
  },
  {
   "id": "blast",
   "effect": "이동속도 거리 내 선택 타일 3x3 영역 대상 공격력 300% 피해",
   "kind": "reward",
   "name": "폭발",
   "note": "",
   "tags": [
    "attack",
    "ranged",
    "area"
   ],
   "upgrades": [
    {
     "effect": "이동속도 거리 내 선택 타일 3x3 범위 대상 공격력 300% 피해, 공격력 50%에 해당하는 화상 3턴 부여",
     "from": "default",
     "key": "red",
     "name": "붉은 폭발",
     "note": "",
     "tags": [
      "attack",
      "ranged",
      "area",
      "burning"
     ],
     "materials": [],
     "costs": [
      {
       "energy": 3
      },
      {
       "mana": 3
      }
     ]
    },
    {
     "effect": "이동속도 거리 내 선택 타일 3x3 범위 대상 공격력 300% 피해, 공격력 50%에 해당하는 빙결 2턴 부여",
     "from": "default",
     "key": "blue",
     "name": "푸른 폭발",
     "note": "",
     "tags": [
      "attack",
      "ranged",
      "area",
      "ice"
     ],
     "materials": [],
     "costs": [
      {
       "energy": 3
      },
      {
       "mana": 3
      }
     ]
    }
   ],
   "memo": [],
   "costs": [
    {
     "energy": 3
    },
    {
     "mana": 3
    }
   ]
  },
  {
   "id": "blink",
   "effect": "이동속도 200% 거리 내 지형과 상관없이 이동",
   "kind": "reward",
   "name": "순간이동",
   "note": "",
   "tags": [
    "move"
   ],
   "upgrades": [
    {
     "effect": "이동속도 200% 거리 내 지형과 상관없이 이동, 도착한 칸 옆에 적이 있으면 마나 3 회복",
     "from": "default",
     "key": "blue",
     "name": "푸른 순간이동",
     "note": "",
     "tags": [
      "move",
      "mana"
     ],
     "materials": [],
     "costs": [
      {
       "mana": 2
      }
     ]
    }
   ],
   "memo": [],
   "costs": [
    {
     "mana": 2
    }
   ]
  },
  {
   "id": "card_absorbing",
   "effect": "패를 1장 버리고, 방어력 50% + 1만큼 마나 회복. 버린 카드가 마나를 사용하는 카드라면, 그 비용만큼 추가로 회복.",
   "kind": "reward",
   "name": "카드 흡수",
   "note": "",
   "tags": [
    "mana",
    "dump"
   ],
   "memo": [],
   "upgrades": [],
   "costs": [
    {
     "energy": 1
    }
   ]
  },
  {
   "id": "card_shield",
   "effect": "카드를 원하는 수만큼 골라 버리고, 방어력 100%*(버린 카드 수 + 1)만큼 방어도 (버린 카드 수 + 1)턴 획득",
   "kind": "reward",
   "name": "카드 방패",
   "note": "",
   "tags": [
    "dump",
    "defense"
   ],
   "memo": [],
   "upgrades": [],
   "costs": [
    {
     "energy": 1
    }
   ]
  },
  {
   "id": "charge",
   "effect": "2 + 이동속도 25%만큼 기력 회복",
   "kind": "reward",
   "name": "충전",
   "note": "",
   "tags": [
    "energy"
   ],
   "memo": [],
   "upgrades": [],
   "costs": [
    {
     "mana": 4
    },
    {
     "hp": 2
    }
   ]
  },
  {
   "id": "chocolate",
   "effect": "1장 드로우\n원한: 기력 1 회복",
   "kind": "reward",
   "name": "초콜릿",
   "note": "",
   "tags": [
    "energy",
    "grudge",
    "draw"
   ],
   "memo": [],
   "upgrades": [],
   "costs": []
  },
  {
   "id": "concentration",
   "effect": "이동속도 50% + 2만큼 드로우",
   "kind": "reward",
   "name": "집중",
   "note": "",
   "tags": [
    "draw"
   ],
   "memo": [],
   "upgrades": [],
   "costs": [
    {
     "energy": 1
    },
    {
     "mana": 1
    },
    {
     "hp": 1
    }
   ]
  },
  {
   "id": "dash",
   "effect": "이동속도 50% 거리 내 이동",
   "kind": "reward",
   "name": "대시",
   "note": "",
   "tags": [
    "move"
   ],
   "memo": [],
   "upgrades": [],
   "costs": []
  },
  {
   "id": "first_aid",
   "effect": "대상의 체력을 방어력 200%만큼 회복한다. 자신에게는 사용할 수 없다.",
   "kind": "reward",
   "name": "응급처치",
   "note": "",
   "tags": [
    "health"
   ],
   "memo": [],
   "upgrades": [],
   "costs": [
    {
     "mana": 2
    }
   ]
  },
  {
   "id": "food",
   "effect": "최대체력 5%만큼 체력을 회복한다. 사용 후 이번 전투동안 소멸된다.",
   "kind": "reward",
   "name": "비상식량",
   "note": "",
   "tags": [
    "health"
   ],
   "memo": [],
   "upgrades": [],
   "costs": []
  },
  {
   "id": "frost",
   "effect": "이동속도 50% 거리 내에 대상에게 공격력 60% 만큼 빙결 2턴 부여",
   "kind": "reward",
   "name": "서리",
   "note": "",
   "tags": [
    "ice",
    "ranged"
   ],
   "memo": [],
   "upgrades": [],
   "costs": [
    {
     "energy": 1
    },
    {
     "mana": 1
    }
   ]
  },
  {
   "id": "guard",
   "effect": "방어력 100%만큼 방어도 1턴 획득",
   "kind": "reward",
   "name": "방어",
   "note": "",
   "tags": [
    "defense"
   ],
   "upgrades": [
    {
     "effect": "옆칸 단일대상에게 지금 가진 방어도 100% 피해",
     "from": "default",
     "key": "purple",
     "name": "방패치기",
     "note": "",
     "tags": [
      "attack",
      "defense"
     ],
     "materials": [],
     "costs": [
      {
       "energy": 1
      },
      {
       "mana": 1
      }
     ]
    },
    {
     "effect": "방어력 100%만큼 방어도 3턴 획득",
     "from": "default",
     "key": "blue",
     "name": "푸른 방어",
     "note": "",
     "tags": [
      "defense"
     ],
     "materials": [],
     "costs": [
      {
       "energy": 1
      },
      {
       "mana": 1
      }
     ]
    }
   ],
   "memo": [],
   "costs": [
    {
     "energy": 1
    },
    {
     "mana": 1
    }
   ]
  },
  {
   "id": "harden",
   "effect": "이번 전투동안 현재 방어력 20%만큼 경질화 부여",
   "kind": "reward",
   "name": "단단해지기",
   "note": "",
   "tags": [
    "hardening"
   ],
   "memo": [],
   "upgrades": [],
   "costs": [
    {
     "mana": 2
    },
    {
     "hp": 1
    }
   ]
  },
  {
   "id": "heavy",
   "effect": "옆칸 단일대상 공격력 250% 피해",
   "kind": "reward",
   "name": "강타",
   "note": "",
   "tags": [
    "attack"
   ],
   "upgrades": [
    {
     "effect": "옆칸 단일대상 공격력 250% 피해 + 대상 최대체력의 10% 피해",
     "from": "default",
     "key": "red",
     "name": "붉은 강타",
     "note": "",
     "tags": [
      "attack"
     ],
     "materials": [],
     "costs": [
      {
       "energy": 2
      },
      {
       "mana": 2
      },
      {
       "hp": 1
      }
     ]
    },
    {
     "effect": "옆칸 단일대상 공격력 250% 피해, 대상 1턴 기절 부여",
     "from": "default",
     "key": "yellow",
     "name": "노란 강타",
     "note": "",
     "tags": [
      "attack",
      "sturn"
     ],
     "materials": [],
     "costs": [
      {
       "energy": 2
      },
      {
       "mana": 2
      },
      {
       "hp": 1
      }
     ]
    },
    {
     "effect": "옆칸 단일대상 공격력 250% 피해, 대상을 처치하면 준 피해의 절반만큼 마나 회복",
     "from": "default",
     "key": "blue",
     "name": "푸른 강타",
     "note": "",
     "tags": [
      "attack",
      "mana"
     ],
     "materials": [],
     "costs": [
      {
       "energy": 2
      },
      {
       "mana": 2
      },
      {
       "hp": 1
      }
     ]
    }
   ],
   "memo": [],
   "costs": [
    {
     "energy": 2
    },
    {
     "mana": 2
    },
    {
     "hp": 1
    }
   ]
  },
  {
   "id": "ignite",
   "effect": "이동속도 50% 거리 내 대상에게 공격력 60% 만큼 화상 2턴 부여",
   "kind": "reward",
   "name": "방화",
   "note": "",
   "tags": [
    "burning",
    "ranged"
   ],
   "memo": [],
   "upgrades": [],
   "costs": [
    {
     "energy": 1
    },
    {
     "mana": 1
    }
   ]
  },
  {
   "id": "insight",
   "effect": "이동속도 75% + 3만큼 드로우, 행동패 제한을 초과할 수 있다.",
   "kind": "reward",
   "name": "통찰",
   "note": "",
   "tags": [
    "draw"
   ],
   "memo": [],
   "upgrades": [],
   "costs": [
    {
     "energy": 3
    },
    {
     "mana": 3
    },
    {
     "hp": 2
    }
   ]
  },
  {
   "id": "larry",
   "effect": "자신 옆칸에 아군 해골병사 소환\n(체력: 방어력의 300%, 공격력: 공격력의 80%, 이동속도: 1, 나머지는 0)\n해골병사: 플레이어 턴 시작시마다 가장 가까운 적에게 이동속도만큼 다가가 공격력 100% 피해, 대상을 도발. ",
   "kind": "reward",
   "name": "해골병사",
   "note": "",
   "tags": [
    "tag_1",
    "attack",
    "taunt"
   ],
   "memo": [],
   "upgrades": [],
   "costs": [
    {
     "mana": 3
    },
    {
     "hp": 2
    }
   ]
  },
  {
   "id": "lightning_bolt",
   "effect": "현재위치 3x3 영역 대상 공격력 100% 피해 + 기절 1턴 부여",
   "kind": "reward",
   "name": "천둥",
   "note": "",
   "tags": [
    "sturn",
    "attack",
    "area"
   ],
   "memo": [],
   "upgrades": [],
   "costs": [
    {
     "energy": 2
    },
    {
     "mana": 2
    }
   ]
  },
  {
   "id": "overload",
   "effect": "2만큼 기력을 얻고, 무기력 2만큼 1턴 부여",
   "kind": "reward",
   "name": "과부하",
   "note": "",
   "tags": [
    "energy",
    "lethargy"
   ],
   "memo": [],
   "upgrades": [],
   "costs": []
  },
  {
   "id": "pray",
   "effect": "덱/묘지에서 카드 1장을 골라 패로 가져옴",
   "kind": "reward",
   "name": "기도",
   "note": "",
   "tags": [
    "draw"
   ],
   "memo": [],
   "upgrades": [],
   "costs": [
    {
     "mana": 2
    },
    {
     "hp": 1
    }
   ]
  },
  {
   "id": "reload",
   "effect": "패를 1장 버리고, 1장 + 이동속도 25%만큼 드로우",
   "kind": "reward",
   "name": "리로드",
   "note": "",
   "tags": [
    "draw",
    "dump"
   ],
   "memo": [],
   "upgrades": [],
   "costs": [
    {
     "energy": 1
    },
    {
     "mana": 1
    },
    {
     "hp": 1
    }
   ]
  },
  {
   "id": "rest",
   "effect": "방어력 50% + 1만큼 마나를 회복한다.",
   "kind": "reward",
   "name": "휴식",
   "note": "",
   "tags": [
    "mana"
   ],
   "upgrades": [
    {
     "effect": "1 + 방어력 25%만큼 체력을 회복한다.",
     "from": "default",
     "key": "green",
     "name": "초록 휴식",
     "note": "",
     "tags": [
      "health"
     ],
     "materials": [],
     "costs": [
      {
       "energy": 3
      },
      {
       "mana": 4
      },
      {
       "hp": 2
      }
     ]
    }
   ],
   "memo": [],
   "costs": [
    {
     "energy": 1
    },
    {
     "mana": 2
    },
    {
     "hp": 1
    }
   ]
  },
  {
   "id": "roll",
   "effect": "이동속도 50% 거리 내 이동, 이동속도 25% + 1만큼 드로우",
   "kind": "reward",
   "name": "구르기",
   "note": "",
   "tags": [
    "move",
    "draw"
   ],
   "upgrades": [
    {
     "effect": "이동속도 50% 거리 내 이동, 이동속도 25% + 1만큼 드로우, 디버프 상태이상 1개 제거",
     "from": "default",
     "key": "green",
     "name": "초록 구르기",
     "note": "",
     "tags": [
      "move",
      "draw",
      "cleanse"
     ],
     "materials": [],
     "costs": [
      {
       "energy": 1
      },
      {
       "mana": 1
      }
     ]
    }
   ],
   "memo": [],
   "costs": [
    {
     "energy": 1
    },
    {
     "mana": 1
    }
   ]
  },
  {
   "id": "shield",
   "effect": "방어력 200%만큼 방어도 3턴 획득",
   "kind": "reward",
   "name": "보호막",
   "note": "",
   "tags": [
    "defense"
   ],
   "memo": [],
   "upgrades": [],
   "costs": [
    {
     "energy": 2
    },
    {
     "mana": 2
    },
    {
     "hp": 1
    }
   ]
  },
  {
   "id": "shield_fix",
   "effect": "적용된 모든 방어도에 방어도 30% 증가 + 지속시간 1턴 증가",
   "kind": "reward",
   "name": "방패고정",
   "note": "",
   "tags": [
    "defense"
   ],
   "memo": [],
   "upgrades": [],
   "costs": [
    {
     "energy": 1
    },
    {
     "mana": 1
    }
   ]
  },
  {
   "id": "sprint",
   "effect": "거리 제한없이 이동, 이동속도 50% + 2만큼 드로우",
   "kind": "reward",
   "name": "전력질주",
   "note": "",
   "tags": [
    "draw",
    "move"
   ],
   "memo": [],
   "upgrades": [],
   "costs": [
    {
     "energy": 3
    },
    {
     "mana": 3
    }
   ]
  },
  {
   "id": "step",
   "effect": "이동속도 거리 이내 이동",
   "kind": "basic",
   "name": "이동",
   "note": "",
   "tags": [
    "move"
   ],
   "upgrades": [
    {
     "effect": "이동속도 거리 이내 이동, 이동한 칸 수만큼 힘 1턴 부여",
     "from": "default",
     "key": "red",
     "name": "붉은 이동",
     "note": "",
     "tags": [
      "move",
      "strength"
     ],
     "materials": [],
     "costs": [
      {
       "energy": 1
      }
     ]
    }
   ],
   "memo": [],
   "costs": [
    {
     "energy": 1
    }
   ]
  },
  {
   "id": "strike",
   "effect": "옆칸 단일대상 공격력 100% 피해",
   "kind": "basic",
   "name": "공격",
   "note": "",
   "tags": [
    "attack"
   ],
   "upgrades": [
    {
     "effect": "옆칸 단일대상 공격력 80% 피해 2회",
     "from": "default",
     "key": "red",
     "name": "연격",
     "note": "",
     "tags": [
      "attack"
     ],
     "materials": [],
     "costs": [
      {
       "energy": 1
      }
     ]
    }
   ],
   "memo": [],
   "costs": [
    {
     "energy": 1
    }
   ]
  },
  {
   "id": "totem",
   "effect": "방어력 200%의 체력을 가진 토템 소환(3턴 지속)\n토템: 토템으로부터 3칸 이내의 적에게 도발 부여",
   "kind": "reward",
   "name": "토템",
   "note": "",
   "tags": [
    "tag_1",
    "taunt"
   ],
   "upgrades": [
    {
     "effect": "방어력 200%의 체력을 가진 토템 소환(3턴 지속)\n토템: 토템으로부터 3칸 이내의 적에게 도발 부여, 지속시간이 끝나거나 파괴되면 2칸 이내의 적에게 공격력 100% 피해",
     "from": "default",
     "key": "red",
     "name": "붉은 토템",
     "note": "",
     "tags": [
      "tag_1",
      "attack",
      "taunt"
     ],
     "materials": [],
     "costs": [
      {
       "energy": 2
      },
      {
       "mana": 2
      },
      {
       "hp": 2
      }
     ]
    }
   ],
   "memo": [],
   "costs": [
    {
     "mana": 2
    },
    {
     "hp": 1
    }
   ]
  },
  {
   "id": "zoom_punch",
   "effect": "옆칸 대상 공격력 50% 피해\n사용시마다 \"줌 펀치\" 카드 피해량이 공격력 50%만큼 증가",
   "kind": "reward",
   "name": "줌 펀치",
   "note": "",
   "tags": [
    "attack"
   ],
   "memo": [],
   "upgrades": [],
   "costs": [
    {
     "energy": 2
    },
    {
     "mana": 2
    }
   ]
  }
 ],
 "equipment": [
  {
   "id": "bent_dagger",
   "name": "구부러진 단검",
   "slot": "hand",
   "rarity": "uncommon",
   "price": 60,
   "source": "",
   "effect": "바로 옆 칸의 대상에게 주는 피해 25% 증가",
   "tags": [
    "attack"
   ],
   "note": "",
   "memo": []
  },
  {
   "id": "mana_book",
   "name": "마력석 꽂힌 마법서",
   "slot": "back",
   "rarity": "rare",
   "price": 85,
   "source": "",
   "effect": "턴이 시작될 때마다 마나 2 회복. 전투방에 들어갈 때도 회복한다.",
   "tags": [
    "mana"
   ],
   "note": "",
   "memo": []
  },
  {
   "id": "red_charm",
   "name": "붉은 부적",
   "slot": "trinket",
   "rarity": "uncommon",
   "price": 55,
   "source": "",
   "effect": "적을 쓰러뜨리면 체력 2 회복",
   "tags": [
    "health"
   ],
   "note": "",
   "memo": []
  },
  {
   "id": "iron_helm",
   "name": "철모",
   "slot": "head",
   "rarity": "common",
   "price": 40,
   "source": "",
   "effect": "전투방에 들어갈 때 방어도 6 (2턴) 획득",
   "tags": [
    "defense"
   ],
   "note": "",
   "memo": []
  },
  {
   "id": "leather_armor",
   "name": "가죽 갑옷",
   "slot": "body",
   "rarity": "common",
   "price": 45,
   "source": "",
   "effect": "방어력 +2",
   "tags": [
    "defense"
   ],
   "note": "",
   "memo": []
  },
  {
   "id": "worn_boots",
   "name": "낡은 장화",
   "slot": "feet",
   "rarity": "common",
   "price": 40,
   "source": "",
   "effect": "이동속도 +1",
   "tags": [
    "move"
   ],
   "note": "",
   "memo": []
  },
  {
   "id": "work_belt",
   "name": "작업용 벨트",
   "slot": "waist",
   "rarity": "rare",
   "price": 80,
   "source": "",
   "effect": "행동 패 +1",
   "tags": [
    "draw"
   ],
   "note": "",
   "memo": []
  }
 ],
 "materials": [
  {
   "id": "bone",
   "name": "뼈",
   "note": "",
   "source": "",
   "memo": []
  },
  {
   "id": "leather",
   "name": "가죽",
   "note": "",
   "source": "",
   "memo": []
  },
  {
   "id": "mana_stone",
   "name": "마력석",
   "note": "",
   "source": "",
   "memo": []
  },
  {
   "id": "mat_1",
   "name": "이빨",
   "note": "",
   "source": "",
   "memo": []
  },
  {
   "id": "slime",
   "name": "점액",
   "note": "",
   "source": "",
   "memo": []
  },
  {
   "id": "stone",
   "name": "돌멩이",
   "note": "",
   "source": "",
   "memo": []
  },
  {
   "id": "string",
   "name": "실",
   "note": "",
   "source": "",
   "memo": []
  }
 ],
 "enemies": [
  {
   "id": "goblin",
   "atk": 5,
   "def": 5,
   "drops": [
    {
     "chance": 25,
     "count": 1,
     "id": "leather"
    },
    {
     "chance": 25,
     "count": 1,
     "id": "bone"
    }
   ],
   "floors": "1-...",
   "hp": 16,
   "name": "고블린",
   "note": ".",
   "pattern": "A. 플레이어와 같은 행 또는 열에 있고 벽으로 막혀있지 않다면, 플레이어를 향해 끝없이 돌진한다. 부딪힌 대상에게 공격력의 250% 피해\nB. 1턴 쉰다.\nC. 플레이어와 3칸 이상 거리를 둔다. 이동속도 거리 내로 이동.\nD. A행동이 가능하도록 거리를 이동속도 거리 내로 이동한다.\nA 이후엔 항상 B를 행동한다.\nC와 D를 반복한다.",
   "speed": 1,
   "tags": [
    "charge"
   ],
   "memo": []
  },
  {
   "id": "mini_stone_golem",
   "atk": 5,
   "def": 8,
   "drops": [
    {
     "chance": 37.5,
     "count": 1,
     "id": "stone"
    },
    {
     "chance": 12.5,
     "count": 1,
     "id": "mana_stone"
    }
   ],
   "floors": "1-...",
   "hp": 12,
   "name": "미니 돌 골렘",
   "note": "",
   "pattern": "A. 플레이어에게 이동속도만큼 다가가거나, 옆칸에 있다면 방어력 100% 피해\nB. 방어력 100%만큼 방어도 1턴 획득\nC. 1턴 쉰다.\n패턴 로테이션은 [ABC]. 어느 행동부터 시작할지는 무작위 결정.",
   "speed": 1,
   "tags": [
    "defense"
   ],
   "memo": []
  },
  {
   "id": "ogre",
   "atk": 9,
   "def": 6,
   "drops": [
    {
     "chance": 37.5,
     "count": 1,
     "id": "leather"
    },
    {
     "chance": 37.5,
     "count": 1,
     "id": "bone"
    },
    {
     "chance": 25,
     "count": 1,
     "id": "mat_1"
    }
   ],
   "floors": "1-...",
   "hp": 32,
   "name": "오우거",
   "note": "",
   "pattern": "A. 플레이어에게 이동속도만큼 다가가거나, 옆칸이면 공격력 100% 피해\nB. 플레이어를 향해 이동속도 300% 거리 이내로 도약하여 주변 2칸 공격력 100% 피해. 벽이 있을 경우 사용불가. 도약 위치 정중앙에 플레이어가 있다면, 플레이어를 1칸 밀쳐낸다.\nC. 1턴 쉰다.\nD. 음식을 먹어 체력을 방어력 100%만큼 회복한다.\n패턴 로테이션은 [AABCD, ABACD] 중 1. 어느 행동부터 시작할지는 무작위 결정.",
   "speed": 1,
   "tags": [
    "health",
    "area"
   ],
   "memo": []
  },
  {
   "id": "rat",
   "atk": 3,
   "def": 2,
   "drops": [
    {
     "chance": 25,
     "count": 1,
     "id": "leather"
    }
   ],
   "floors": "1-...",
   "hp": 8,
   "name": "들쥐",
   "note": "무리지어 다닌다. (2~3마리)",
   "pattern": "A. 플레이어에게 이동속도만큼 이동, 옆칸이거나 최대이동거리가 아니었다면 플레이어에게 공격력 100% 피해\nA 반복",
   "speed": 2,
   "memo": [],
   "tags": []
  },
  {
   "id": "skeleton",
   "atk": 7,
   "def": 5,
   "drops": [
    {
     "chance": 50,
     "count": 1,
     "id": "bone"
    }
   ],
   "floors": "1-...",
   "hp": 12,
   "name": "해골",
   "note": "",
   "pattern": "A. 플레이어에게 이동속도만큼 이동 또는 옆칸인 경우 100% 공격력 피해\nB. 플레이어 위치 3 거리 범위 내에 무작위 위치로 뼈를 3개 던져 공격력 80% 피해. 뼈는 같은 자리에 던지지 않으며, 하나는 반드시 플레이어 위치를 향한다. 사거리는 5이며, 플레이어가 그 밖에 있다면 이전과 같은 행동을 한다.\nC. 방어력 100%만큼 방어도 1턴을 얻는다.\nD. 1턴 쉰다.\n패턴 로테이션은 [AADBC, AACBD, ACADAB] 중 1. 어느 행동부터 시작할지는 무작위 결정.",
   "speed": 1,
   "tags": [
    "ranged",
    "area",
    "defense"
   ],
   "memo": []
  },
  {
   "id": "slime",
   "atk": 5,
   "def": 5,
   "drops": [
    {
     "chance": 25,
     "count": 1,
     "id": "slime"
    }
   ],
   "floors": "1-...",
   "hp": 12,
   "name": "슬라임",
   "note": "",
   "pattern": "A. 플레이어에게 이동속도만큼 다가가거나, 옆칸에 있다면 100% 피해를 준다.\nB. 방어력 100%에 해당하는 방어도(1턴)을 얻는다.\nC. 1턴 쉰다.\nD. 플레이어 위치로 1칸 거리 범위 점액을 던진다. 공격력 80% 피해. 맞으면 둔화(50%, 2턴 지속)에 걸린다. 벽에 막힌다. 사거리는 5.\n패턴 로테이션은 [AABCD, ABACD, AAACDB] 중 1. 어느 행동부터 시작할지는 무작위 결정.",
   "speed": 1,
   "tags": [
    "slowness",
    "ranged",
    "area",
    "defense"
   ],
   "memo": []
  },
  {
   "id": "spider",
   "atk": 3,
   "def": 3,
   "drops": [
    {
     "chance": 25,
     "count": 1,
     "id": "string"
    }
   ],
   "floors": "1-...",
   "hp": 12,
   "name": "거미",
   "note": "",
   "pattern": "A. 사거리 5(벽에 막힘) 플레이어 위치로 실을 발사한다. 맞으면 방어력 50%만큼의 턴 동안 속박 상태가 된다. 사거리가 닿지 않으면 B 행동을 한다.\nB. 플레이어에게 이동속도만큼 다가가거나, 옆칸이라면 공격력 100%만큼의 독 상태이상을 부여한다.\nC. 한턴 쉰다.\n패턴 로테이션은 [BBCA, BCBA] 중 1. 어느 행동부터 시작할지는 무작위 결정.",
   "speed": 1,
   "tags": [
    "poison",
    "root",
    "ranged"
   ],
   "memo": []
  },
  {
   "id": "stone_golem",
   "atk": 8,
   "def": 12,
   "drops": [
    {
     "chance": 75,
     "count": 1,
     "id": "stone"
    },
    {
     "chance": 25,
     "count": 1,
     "id": "mana_stone"
    }
   ],
   "floors": "1-...",
   "hp": 32,
   "name": "돌 골렘",
   "note": "",
   "pattern": "A. 플레이어 위치에 돌을 던져 공격력 100% 피해(사거리 5, 안 닿으면 D 행동)\nB. 플레이어에게 이동속도만큼 다가가거나, 옆칸에 있다면 방어력 100% 피해\nC. 방어력의 20%만큼 경질화를 얻고, 방어력 100%만큼 방어도 2턴 획득\nD. 1턴 쉰다.\n패턴 로테이션은 [ABCDBD, ADCBDB] 중 1. 어느 행동부터 시작할지는 무작위 결정.",
   "speed": 1,
   "tags": [
    "defense",
    "hardening",
    "ranged"
   ],
   "memo": []
  },
  {
   "id": "wolf",
   "atk": 4,
   "def": 3,
   "drops": [
    {
     "chance": 10,
     "count": 1,
     "id": "mat_1"
    },
    {
     "chance": 15,
     "count": 1,
     "id": "leather"
    }
   ],
   "floors": "1-...",
   "hp": 10,
   "name": "늑대",
   "note": "무리지어 다닌다. (1~2마리)",
   "pattern": "A. 플레이어에게 이동속도만큼 이동, 옆칸이거나 최대이동거리가 아니었다면 플레이어에게 공격력 100% 피해. 공격 성공시 피해량 절반만큼 회복.\nB. 1턴 쉬기\nC. 울부짖어 힘 영구 1 획득\n플레이어가 사거리 5 밖으로 3턴 이상 있다면 C 행동 실행. 이후 사거리 안으로 들어올 때까지 A 5회 반복.\n4번 행동시 다음 행동은 항상 B. 사거리 5 안에 있다면, 항상 A 행동 실행.",
   "speed": 2,
   "tags": [
    "health",
    "strength"
   ],
   "memo": []
  }
 ],
 "tags": [
  {
   "id": "area",
   "color": "violet",
   "name": "범위",
   "note": "여러 칸을 한꺼번에 노리는 카드 또는 효과에 부여된다.",
   "tags": [
    "area"
   ],
   "memo": []
  },
  {
   "id": "attack",
   "color": "pink",
   "name": "공격",
   "note": "상대에게 피해를 주는 카드 또는 효과에 부여된다.",
   "tags": [
    "attack"
   ],
   "memo": []
  },
  {
   "id": "burning",
   "color": "red",
   "name": "화상",
   "note": "디버프 상태이상: 턴 시작시 수치만큼 피해를 입는다. (N턴)",
   "tags": [
    "burning"
   ],
   "memo": []
  },
  {
   "id": "charge",
   "color": "red",
   "keywords": "돌진",
   "name": "돌진",
   "note": "앞으로 빠르게 돌진한다. 부딪히면 피해를 입는다.",
   "tags": [
    "charge"
   ],
   "memo": []
  },
  {
   "id": "cleanse",
   "color": "teal",
   "name": "정화",
   "note": "디버프 상태이상을 지우는 카드 또는 효과에 부여된다.",
   "tags": [
    "cleanse"
   ],
   "memo": []
  },
  {
   "id": "defense",
   "color": "blue",
   "name": "방어",
   "note": "방어도를 얻거나, 피해를 감소하는 카드 또는 효과에 부여된다.",
   "tags": [
    "defense"
   ],
   "memo": []
  },
  {
   "id": "draw",
   "color": "amber",
   "name": "드로우",
   "note": "카드를 뽑는 카드 또는 효과에 부여된다.",
   "tags": [
    "draw"
   ],
   "memo": []
  },
  {
   "id": "dump",
   "color": "violet",
   "name": "버림",
   "note": "카드를 버리는 효과 관련 태그",
   "tags": [
    "dump"
   ],
   "memo": []
  },
  {
   "id": "energy",
   "color": "orange",
   "name": "기력",
   "note": "기력 관련 태그",
   "tags": [
    "energy"
   ],
   "memo": []
  },
  {
   "id": "grudge",
   "color": "violet",
   "name": "원한",
   "note": "버려질 때, 발동되는 효과",
   "tags": [
    "grudge"
   ],
   "memo": []
  },
  {
   "id": "hardening",
   "color": "sky",
   "keywords": "",
   "name": "경질화",
   "note": "버프 상태이상: 수치만큼 방어력이 증가한다. ( N턴 )",
   "tags": [
    "hardening"
   ],
   "memo": []
  },
  {
   "id": "health",
   "color": "green",
   "name": "체력",
   "note": "체력 관련 태그",
   "tags": [
    "health"
   ],
   "memo": []
  },
  {
   "id": "ice",
   "color": "indigo",
   "name": "빙결",
   "note": "디버프 상태이상: 피해를 입을 때, 수치만큼 추가피해를 입는다. (N턴)",
   "tags": [
    "ice"
   ],
   "memo": []
  },
  {
   "id": "lethargy",
   "color": "indigo",
   "name": "무기력",
   "note": "디버프 상태이상: 턴 시작시 얻는 기력이 수치만큼 감소한다.",
   "tags": [
    "lethargy"
   ],
   "memo": []
  },
  {
   "id": "mana",
   "color": "blue",
   "keywords": "",
   "name": "마나",
   "note": "마나 관련 태그",
   "tags": [
    "mana"
   ],
   "memo": []
  },
  {
   "id": "move",
   "color": "amber",
   "name": "이동",
   "note": "움직이는 카드 또는 효과에 부여된다.",
   "tags": [
    "move"
   ],
   "memo": []
  },
  {
   "id": "poison",
   "color": "green",
   "name": "독",
   "note": "디버프 상태이상: 턴 종료시 수치만큼 피해를 입고, 중첩이 1 감소한다.",
   "tags": [
    "poison"
   ],
   "memo": []
  },
  {
   "id": "ranged",
   "color": "amber",
   "name": "원거리",
   "note": "사거리가 있어 떨어진 대상을 노리는 카드 또는 효과에 부여된다.",
   "tags": [
    "ranged"
   ],
   "memo": []
  },
  {
   "id": "root",
   "color": "sky",
   "name": "속박",
   "note": "디버프 상태이상: 움직이지 못한다. (N턴)",
   "tags": [
    "root"
   ],
   "memo": []
  },
  {
   "id": "slowness",
   "color": "indigo",
   "name": "둔화",
   "note": "디버프 상태이상: 이동속도가 감소한다. (N턴)",
   "tags": [
    "slowness"
   ],
   "memo": []
  },
  {
   "id": "strength",
   "color": "red",
   "name": "힘",
   "note": "버프 상태이상: 수치만큼 공격력 증가 (N턴)",
   "tags": [
    "strength"
   ],
   "memo": []
  },
  {
   "id": "sturn",
   "color": "amber",
   "name": "기절",
   "note": "디버프 상태이상 : 행동을 할 수 없다 (N턴)",
   "tags": [
    "sturn"
   ],
   "memo": []
  },
  {
   "id": "tag_1",
   "color": "violet",
   "name": "소환",
   "note": "",
   "tags": [
    "tag_1"
   ],
   "memo": []
  },
  {
   "id": "taunt",
   "color": "pink",
   "name": "도발",
   "note": "공격대상이 자신이 되도록 한다.",
   "tags": [
    "taunt"
   ],
   "memo": []
  }
 ],
 "folders": [
  {
   "id": "blue_memories",
   "items": [
    {
     "c": "tags",
     "id": "hardening"
    },
    {
     "c": "tags",
     "id": "slowness"
    },
    {
     "c": "tags",
     "id": "mana"
    },
    {
     "c": "tags",
     "id": "lethargy"
    },
    {
     "c": "tags",
     "id": "defense"
    },
    {
     "c": "tags",
     "id": "ice"
    },
    {
     "c": "tags",
     "id": "root"
    }
   ],
   "name": "푸른 기억",
   "note": "",
   "parent": "color_memories",
   "memo": []
  },
  {
   "id": "color_memories",
   "name": "색 기억",
   "note": "",
   "parent": "",
   "memo": [],
   "items": []
  },
  {
   "id": "green_memories",
   "items": [
    {
     "c": "tags",
     "id": "poison"
    },
    {
     "c": "tags",
     "id": "tag_1"
    },
    {
     "c": "tags",
     "id": "cleanse"
    },
    {
     "c": "tags",
     "id": "health"
    }
   ],
   "name": "초록 기억",
   "note": "",
   "parent": "color_memories",
   "memo": []
  },
  {
   "id": "purple_memories",
   "items": [
    {
     "c": "tags",
     "id": "dump"
    },
    {
     "c": "tags",
     "id": "area"
    },
    {
     "c": "tags",
     "id": "grudge"
    }
   ],
   "name": "자줏빛 기억",
   "note": "",
   "parent": "color_memories",
   "memo": []
  },
  {
   "id": "red_memories",
   "items": [
    {
     "c": "tags",
     "id": "attack"
    },
    {
     "c": "tags",
     "id": "taunt"
    },
    {
     "c": "tags",
     "id": "energy"
    },
    {
     "c": "tags",
     "id": "charge"
    },
    {
     "c": "tags",
     "id": "strength"
    },
    {
     "c": "tags",
     "id": "burning"
    }
   ],
   "name": "붉은 기억",
   "note": "",
   "parent": "color_memories",
   "memo": []
  },
  {
   "id": "yellow_memories",
   "items": [
    {
     "c": "tags",
     "id": "energy"
    },
    {
     "c": "tags",
     "id": "sturn"
    },
    {
     "c": "tags",
     "id": "draw"
    },
    {
     "c": "tags",
     "id": "ranged"
    },
    {
     "c": "tags",
     "id": "move"
    }
   ],
   "name": "노란 기억",
   "note": "",
   "parent": "color_memories",
   "memo": []
  }
 ]
};
