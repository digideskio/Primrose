var CodePage = Primrose.Text.CodePage;

pliny.record({
  parent: "Primrose.Text.CodePages",
  name: "FR_AZERTY",
  description: "| [under construction]"
});
const FR_AZERTY = new CodePage("Français: AZERTY", "fr", {
  deadKeys: [221, 50, 55],
  NORMAL: {
    "32": " ",
    "48": "à",
    "49": "&",
    "50": "é",
    "51": "\"",
    "52": "'",
    "53": "(",
    "54": "-",
    "55": "è",
    "56": "_",
    "57": "ç",
    "186": "$",
    "187": "=",
    "188": ",",
    "190": ";",
    "191": ":",
    "192": "ù",
    "219": ")",
    "220": "*",
    "221": CodePage.DEAD(1),
    "222": "²",
    "223": "!",
    "226": "<"
  },
  SHIFT: {
    "32": " ",
    "48": "0",
    "49": "1",
    "50": "2",
    "51": "3",
    "52": "4",
    "53": "5",
    "54": "6",
    "55": "7",
    "56": "8",
    "57": "9",
    "186": "£",
    "187": "+",
    "188": "?",
    "190": ".",
    "191": "/",
    "192": "%",
    "219": "°",
    "220": "µ",
    "223": "§",
    "226": ">"
  },
  CTRLALT: {
    "48": "@",
    "50": CodePage.DEAD(2),
    "51": "#",
    "52": "{",
    "53": "[",
    "54": "|",
    "55": CodePage.DEAD(3),
    "56": "\\",
    "57": "^",
    "69": "€",
    "186": "¤",
    "187": "}",
    "219": "]"
  },
  DEAD1NORMAL: {
    "65": "â",
    "69": "ê",
    "73": "î",
    "79": "ô",
    "85": "û"
  },
  DEAD2NORMAL: {
    "65": "ã",
    "78": "ñ",
    "79": "õ"
  },
  DEAD3NORMAL: {
    "48": "à",
    "50": "é",
    "55": "è",
    "65": "à",
    "69": "è",
    "73": "ì",
    "79": "ò",
    "85": "ù"
  }
});