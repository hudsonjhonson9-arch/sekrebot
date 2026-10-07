# Review package - media plan Task 1

## Commits 07ebdd8..73a2b6d

73a2b6d feat(server): add Express skeleton, pg pool, and session token parser

## Diff stat

 package-lock.json    | 1021 +++++++++++++++++++++++++++++++++++++++++++++++++-
 package.json         |    7 +-
 server/auth.js       |   16 +
 server/db.js         |   29 ++
 server/index.js      |   25 ++
 server/media.test.js |   24 ++
 6 files changed, 1120 insertions(+), 2 deletions(-)

## Full diff (-U10)

diff --git a/package-lock.json b/package-lock.json
index 49f09e4..e7917bb 100644
--- a/package-lock.json
+++ b/package-lock.json
@@ -2,20 +2,23 @@
   "name": "absensi-app",
   "version": "0.0.0",
   "lockfileVersion": 3,
   "requires": true,
   "packages": {
     "": {
       "name": "absensi-app",
       "version": "0.0.0",
       "dependencies": {
         "@vladmandic/human": "^3.3.6",
+        "dotenv": "^18.0.5",
+        "express": "^4.22.3",
+        "pg": "^8.23.1",
         "react": "^19.2.4",
         "react-dom": "^19.2.4"
       },
       "devDependencies": {
         "@eslint/js": "^9.39.4",
         "@types/react": "^19.2.14",
         "@types/react-dom": "^19.2.3",
         "@vitejs/plugin-react": "^6.0.1",
         "docxtemplater": "^3.71.0",
         "eslint": "^9.39.4",
@@ -935,20 +938,33 @@
     "node_modules/@xmldom/xmldom": {
       "version": "0.9.12",
       "resolved": "https://registry.npmjs.org/@xmldom/xmldom/-/xmldom-0.9.12.tgz",
       "integrity": "sha512-5AXjrcMClTryPe9LgZrygpB1lj7s0S9E0+W+AHaVKAVyHanafK86iPSvG5xHVSp/jC+VH1UXu0TAEmY279xH7A==",
       "dev": true,
       "license": "MIT",
       "engines": {
         "node": ">=14.6"
       }
     },
+    "node_modules/accepts": {
+      "version": "1.3.8",
+      "resolved": "https://registry.npmjs.org/accepts/-/accepts-1.3.8.tgz",
+      "integrity": "sha512-PYAthTa2m2VKxuvSD3DPC/Gy+U+sOA1LAuT8mkmRuvw+NACSaeXEQ+NHcVF7rONl6qcaxV3Uuemwawk+7+SJLw==",
+      "license": "MIT",
+      "dependencies": {
+        "mime-types": "~2.1.34",
+        "negotiator": "0.6.3"
+      },
+      "engines": {
+        "node": ">= 0.6"
+      }
+    },
     "node_modules/acorn": {
       "version": "8.16.0",
       "resolved": "https://registry.npmjs.org/acorn/-/acorn-8.16.0.tgz",
       "integrity": "sha512-UVJyE9MttOsBQIDKw1skb9nAwQuR5wuGD3+82K6JgJlm/Y+KI92oNsMNGZCYdDsVtRHSak0pcV5Dno5+4jh9sw==",
       "dev": true,
       "license": "MIT",
       "bin": {
         "acorn": "bin/acorn"
       },
       "engines": {
@@ -998,40 +1014,85 @@
         "url": "https://github.com/chalk/ansi-styles?sponsor=1"
       }
     },
     "node_modules/argparse": {
       "version": "2.0.1",
       "resolved": "https://registry.npmjs.org/argparse/-/argparse-2.0.1.tgz",
       "integrity": "sha512-8+9WqebbFzpX9OR+Wa6O29asIogeRMzcGtAINdpMHHyAg10f05aSFVBbcEqGf/PXw1EjAZ+q2/bEBg3DvurK3Q==",
       "dev": true,
       "license": "Python-2.0"
     },
+    "node_modules/array-flatten": {
+      "version": "1.1.1",
+      "resolved": "https://registry.npmjs.org/array-flatten/-/array-flatten-1.1.1.tgz",
+      "integrity": "sha512-PCVAQswWemu6UdxsDFFX/+gVeYqKAod3D3UVm91jHwynguOwAvYPhx8nNlM++NqRcK6CxxpUafjmhIdKiHibqg==",
+      "license": "MIT"
+    },
     "node_modules/balanced-match": {
       "version": "1.0.2",
       "resolved": "https://registry.npmjs.org/balanced-match/-/balanced-match-1.0.2.tgz",
       "integrity": "sha512-3oSeUO0TMV67hN1AmbXsK4yaqU7tjiHlbxRDZOpH0KW9+CeX4bRAaX0Anxt0tx2MrpRpWwQaPwIlISEJhYU5Pw==",
       "dev": true,
       "license": "MIT"
     },
     "node_modules/baseline-browser-mapping": {
       "version": "2.10.19",
       "resolved": "https://registry.npmjs.org/baseline-browser-mapping/-/baseline-browser-mapping-2.10.19.tgz",
       "integrity": "sha512-qCkNLi2sfBOn8XhZQ0FXsT1Ki/Yo5P90hrkRamVFRS7/KV9hpfA4HkoWNU152+8w0zPjnxo5psx5NL3PSGgv5g==",
       "dev": true,
       "license": "Apache-2.0",
       "bin": {
         "baseline-browser-mapping": "dist/cli.cjs"
       },
       "engines": {
         "node": ">=6.0.0"
       }
     },
+    "node_modules/body-parser": {
+      "version": "1.20.8",
+      "resolved": "https://registry.npmjs.org/body-parser/-/body-parser-1.20.8.tgz",
+      "integrity": "sha512-JNcyFQ64OiijEkPzUBTCe+hyPXUD/3LEldGQ6iF5LR1w00mx9o7xtDWHXBY2iItjdCFGoilOLNQbH943ut7pHA==",
+      "license": "MIT",
+      "dependencies": {
+        "bytes": "~3.1.2",
+        "content-type": "~1.0.5",
+        "debug": "2.6.9",
+        "depd": "2.0.0",
+        "destroy": "~1.2.0",
+        "http-errors": "~2.0.1",
+        "iconv-lite": "~0.4.24",
+        "on-finished": "~2.4.1",
+        "qs": "~6.16.0",
+        "raw-body": "~2.5.3",
+        "type-is": "~1.6.18",
+        "unpipe": "~1.0.0"
+      },
+      "engines": {
+        "node": ">= 0.8",
+        "npm": "1.2.8000 || >= 1.4.16"
+      }
+    },
+    "node_modules/body-parser/node_modules/debug": {
+      "version": "2.6.9",
+      "resolved": "https://registry.npmjs.org/debug/-/debug-2.6.9.tgz",
+      "integrity": "sha512-bC7ElrdJaJnPbAP+1EotYvqZsb3ecl5wi6Bfi6BJTUcNowp6cvspg0jXznRTKDjm/E7AdgFBVeAPVMNcKGsHMA==",
+      "license": "MIT",
+      "dependencies": {
+        "ms": "2.0.0"
+      }
+    },
+    "node_modules/body-parser/node_modules/ms": {
+      "version": "2.0.0",
+      "resolved": "https://registry.npmjs.org/ms/-/ms-2.0.0.tgz",
+      "integrity": "sha512-Tpp60P6IUJDTuOq/5Z8cdskzJujfwqfOTkrwIwj7IRISpnkJnT6SyJ4PCPnGMoFjC9ddhal5KVIYtAt97ix05A==",
+      "license": "MIT"
+    },
     "node_modules/brace-expansion": {
       "version": "1.1.14",
       "resolved": "https://registry.npmjs.org/brace-expansion/-/brace-expansion-1.1.14.tgz",
       "integrity": "sha512-MWPGfDxnyzKU7rNOW9SP/c50vi3xrmrua/+6hfPbCS2ABNWfx24vPidzvC7krjU/RTo235sV776ymlsMtGKj8g==",
       "dev": true,
       "license": "MIT",
       "dependencies": {
         "balanced-match": "^1.0.0",
         "concat-map": "0.0.1"
       }
@@ -1063,20 +1124,58 @@
         "node-releases": "^2.0.36",
         "update-browserslist-db": "^1.2.3"
       },
       "bin": {
         "browserslist": "cli.js"
       },
       "engines": {
         "node": "^6 || ^7 || ^8 || ^9 || ^10 || ^11 || ^12 || >=13.7"
       }
     },
+    "node_modules/bytes": {
+      "version": "3.1.2",
+      "resolved": "https://registry.npmjs.org/bytes/-/bytes-3.1.2.tgz",
+      "integrity": "sha512-/Nf7TyzTx6S3yRJObOAV7956r8cr2+Oj8AC5dt8wSP3BQAoeX58NoHyCU8P8zGkNXStjTSi6fzO6F0pBdcYbEg==",
+      "license": "MIT",
+      "engines": {
+        "node": ">= 0.8"
+      }
+    },
+    "node_modules/call-bind-apply-helpers": {
+      "version": "1.0.2",
+      "resolved": "https://registry.npmjs.org/call-bind-apply-helpers/-/call-bind-apply-helpers-1.0.2.tgz",
+      "integrity": "sha512-Sp1ablJ0ivDkSzjcaJdxEunN5/XvksFJ2sMBFfq6x0ryhQV/2b/KwFe21cMpmHtPOSij8K99/wSfoEuTObmuMQ==",
+      "license": "MIT",
+      "dependencies": {
+        "es-errors": "^1.3.0",
+        "function-bind": "^1.1.2"
+      },
+      "engines": {
+        "node": ">= 0.4"
+      }
+    },
+    "node_modules/call-bound": {
+      "version": "1.0.4",
+      "resolved": "https://registry.npmjs.org/call-bound/-/call-bound-1.0.4.tgz",
+      "integrity": "sha512-+ys997U96po4Kx/ABpBCqhA9EuxJaQWDQg7295H4hBphv3IZg0boBKuwYpt4YXp6MZ5AmZQnU/tyMTlRpaSejg==",
+      "license": "MIT",
+      "dependencies": {
+        "call-bind-apply-helpers": "^1.0.2",
+        "get-intrinsic": "^1.3.0"
+      },
+      "engines": {
+        "node": ">= 0.4"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/ljharb"
+      }
+    },
     "node_modules/callsites": {
       "version": "3.1.0",
       "resolved": "https://registry.npmjs.org/callsites/-/callsites-3.1.0.tgz",
       "integrity": "sha512-P8BjAsXvZS+VIDUI11hHCQEv74YT67YUi5JJFNWIqL235sBmjX4+qx9Muvls5ivyNENctx46xQLQ3aTuE7ssaQ==",
       "dev": true,
       "license": "MIT",
       "engines": {
         "node": ">=6"
       }
     },
@@ -1138,27 +1237,63 @@
       "dev": true,
       "license": "MIT"
     },
     "node_modules/concat-map": {
       "version": "0.0.1",
       "resolved": "https://registry.npmjs.org/concat-map/-/concat-map-0.0.1.tgz",
       "integrity": "sha512-/Srv4dswyQNBfohGpz9o6Yb3Gz3SrUDqBH5rTuhGR7ahtlbYKnVxw2bCFMRljaA7EXHaXZ8wsHdodFvbkhKmqg==",
       "dev": true,
       "license": "MIT"
     },
+    "node_modules/content-disposition": {
+      "version": "0.5.4",
+      "resolved": "https://registry.npmjs.org/content-disposition/-/content-disposition-0.5.4.tgz",
+      "integrity": "sha512-FveZTNuGw04cxlAiWbzi6zTAL/lhehaWbTtgluJh4/E95DqMwTmha3KZN1aAWA8cFIhHzMZUvLevkw5Rqk+tSQ==",
+      "license": "MIT",
+      "dependencies": {
+        "safe-buffer": "5.2.1"
+      },
+      "engines": {
+        "node": ">= 0.6"
+      }
+    },
+    "node_modules/content-type": {
+      "version": "1.0.5",
+      "resolved": "https://registry.npmjs.org/content-type/-/content-type-1.0.5.tgz",
+      "integrity": "sha512-nTjqfcBFEipKdXCv4YDQWCfmcLZKm81ldF0pAopTvyrFGVbcR6P/VAAd5G7N+0tTr8QqiU0tFadD6FK4NtJwOA==",
+      "license": "MIT",
+      "engines": {
+        "node": ">= 0.6"
+      }
+    },
     "node_modules/convert-source-map": {
       "version": "2.0.0",
       "resolved": "https://registry.npmjs.org/convert-source-map/-/convert-source-map-2.0.0.tgz",
       "integrity": "sha512-Kvp459HrV2FEJ1CAsi1Ku+MY3kasH19TFykTz2xWmMeq6bk2NU3XXvfJ+Q61m0xktWwt+1HSYf3JZsTms3aRJg==",
       "dev": true,
       "license": "MIT"
     },
+    "node_modules/cookie": {
+      "version": "0.7.2",
+      "resolved": "https://registry.npmjs.org/cookie/-/cookie-0.7.2.tgz",
+      "integrity": "sha512-yki5XnKuf750l50uGTllt6kKILY4nQ1eNIQatoXEByZ5dWgnKqbnqmTrBE5B4N7lrMJKQ2ytWMiTO2o0v6Ew/w==",
+      "license": "MIT",
+      "engines": {
+        "node": ">= 0.6"
+      }
+    },
+    "node_modules/cookie-signature": {
+      "version": "1.0.7",
+      "resolved": "https://registry.npmjs.org/cookie-signature/-/cookie-signature-1.0.7.tgz",
+      "integrity": "sha512-NXdYc3dLr47pBkpUCHtKSwIOQXLVn8dZEuywboCOJY/osA0wFSLlSawr3KN8qXJEyX66FcONTH8EIlVuK0yyFA==",
+      "license": "MIT"
+    },
     "node_modules/cross-spawn": {
       "version": "7.0.6",
       "resolved": "https://registry.npmjs.org/cross-spawn/-/cross-spawn-7.0.6.tgz",
       "integrity": "sha512-uV2QOWP2nWzsy2aMp8aRibhi9dlzF5Hgh5SHaB9OiTGEyDTiJJyx0uy51QXdyWbtAHNua4XJzUKca3OzKUd3vA==",
       "dev": true,
       "license": "MIT",
       "dependencies": {
         "path-key": "^3.1.0",
         "shebang-command": "^2.0.0",
         "which": "^2.0.1"
@@ -1192,20 +1327,39 @@
         }
       }
     },
     "node_modules/deep-is": {
       "version": "0.1.4",
       "resolved": "https://registry.npmjs.org/deep-is/-/deep-is-0.1.4.tgz",
       "integrity": "sha512-oIPzksmTg4/MriiaYGO+okXDT7ztn/w3Eptv/+gSIdMdKsJo0u4CfYNFJPy+4SKMuCqGw2wxnA+URMg3t8a/bQ==",
       "dev": true,
       "license": "MIT"
     },
+    "node_modules/depd": {
+      "version": "2.0.0",
+      "resolved": "https://registry.npmjs.org/depd/-/depd-2.0.0.tgz",
+      "integrity": "sha512-g7nH6P6dyDioJogAAGprGpCtVImJhpPk/roCzdb3fIh61/s/nPsfR6onyMwkCAR/OlC3yBC0lESvUoQEAssIrw==",
+      "license": "MIT",
+      "engines": {
+        "node": ">= 0.8"
+      }
+    },
+    "node_modules/destroy": {
+      "version": "1.2.0",
+      "resolved": "https://registry.npmjs.org/destroy/-/destroy-1.2.0.tgz",
+      "integrity": "sha512-2sJGJTaXIIaR1w4iJSNoN0hnMY7Gpc/n8D4qSCJw8QqFWXf7cuAgnEHxBpweaVcPevC2l3KpjYCx3NypQQgaJg==",
+      "license": "MIT",
+      "engines": {
+        "node": ">= 0.8",
+        "npm": "1.2.8000 || >= 1.4.16"
+      }
+    },
     "node_modules/detect-libc": {
       "version": "2.1.2",
       "resolved": "https://registry.npmjs.org/detect-libc/-/detect-libc-2.1.2.tgz",
       "integrity": "sha512-Btj2BOOO83o3WyH59e8MgXsxEQVcarkUOpEYrubB0urwnN10yQ364rsiByU11nZlqWYZm05i/of7io4mzihBtQ==",
       "dev": true,
       "license": "Apache-2.0",
       "engines": {
         "node": ">=8"
       }
     },
@@ -1215,37 +1369,117 @@
       "integrity": "sha512-4SyQzPVDrhsPb9vHNstxJpJWMLJvrbKEcXDRNBlb5Bnbjqm1T51PVt5r+iLVe1yAkmIvakk8M3KywO5m5LsUSA==",
       "dev": true,
       "license": "MIT",
       "dependencies": {
         "@xmldom/xmldom": "^0.9.12"
       },
       "engines": {
         "node": ">=0.10"
       }
     },
+    "node_modules/dotenv": {
+      "version": "18.0.5",
+      "resolved": "https://registry.npmjs.org/dotenv/-/dotenv-18.0.5.tgz",
+      "integrity": "sha512-aBrGvt6KhjxbEnatqMWOMidftwsrCiCvqh1yNIGB9QyF0J+VcWkKDMsvYOEm7ZS82oiV+BT1sTOtIlAmUlTpwQ==",
+      "license": "BSD-2-Clause",
+      "bin": {
+        "dotenv": "dist/index.cjs"
+      },
+      "engines": {
+        "node": ">=12"
+      },
+      "funding": {
+        "url": "https://dotenvx.com"
+      }
+    },
+    "node_modules/dunder-proto": {
+      "version": "1.0.1",
+      "resolved": "https://registry.npmjs.org/dunder-proto/-/dunder-proto-1.0.1.tgz",
+      "integrity": "sha512-KIN/nDJBQRcXw0MLVhZE9iQHmG68qAVIBg9CqmUYjmQIhgij9U5MFvrqkUL5FbtyyzZuOeOt0zdeRe4UY7ct+A==",
+      "license": "MIT",
+      "dependencies": {
+        "call-bind-apply-helpers": "^1.0.1",
+        "es-errors": "^1.3.0",
+        "gopd": "^1.2.0"
+      },
+      "engines": {
+        "node": ">= 0.4"
+      }
+    },
+    "node_modules/ee-first": {
+      "version": "1.1.1",
+      "resolved": "https://registry.npmjs.org/ee-first/-/ee-first-1.1.1.tgz",
+      "integrity": "sha512-WMwm9LhRUo+WUaRN+vRuETqG89IgZphVSNkdFgeb6sS/E4OrDIN7t48CAewSHXc6C8lefD8KKfr5vY61brQlow==",
+      "license": "MIT"
+    },
     "node_modules/electron-to-chromium": {
       "version": "1.5.336",
       "resolved": "https://registry.npmjs.org/electron-to-chromium/-/electron-to-chromium-1.5.336.tgz",
       "integrity": "sha512-AbH9q9J455r/nLmdNZes0G0ZKcRX73FicwowalLs6ijwOmCJSRRrLX63lcAlzy9ux3dWK1w1+1nsBJEWN11hcQ==",
       "dev": true,
       "license": "ISC"
     },
+    "node_modules/encodeurl": {
+      "version": "2.0.0",
+      "resolved": "https://registry.npmjs.org/encodeurl/-/encodeurl-2.0.0.tgz",
+      "integrity": "sha512-Q0n9HRi4m6JuGIV1eFlmvJB7ZEVxu93IrMyiMsGC0lrMJMWzRgx6WGquyfQgZVb31vhGgXnfmPNNXmxnOkRBrg==",
+      "license": "MIT",
+      "engines": {
+        "node": ">= 0.8"
+      }
+    },
+    "node_modules/es-define-property": {
+      "version": "1.0.1",
+      "resolved": "https://registry.npmjs.org/es-define-property/-/es-define-property-1.0.1.tgz",
+      "integrity": "sha512-e3nRfgfUZ4rNGL232gUgX06QNyyez04KdjFrF+LTRoOXmrOgFKDg4BCdsjW8EnT69eqdYGmRpJwiPVYNrCaW3g==",
+      "license": "MIT",
+      "engines": {
+        "node": ">= 0.4"
+      }
+    },
+    "node_modules/es-errors": {
+      "version": "1.3.0",
+      "resolved": "https://registry.npmjs.org/es-errors/-/es-errors-1.3.0.tgz",
+      "integrity": "sha512-Zf5H2Kxt2xjTvbJvP2ZWLEICxA6j+hAmMzIlypy4xcBg1vKVnx89Wy0GbS+kf5cwCVFFzdCFh2XSCFNULS6csw==",
+      "license": "MIT",
+      "engines": {
+        "node": ">= 0.4"
+      }
+    },
+    "node_modules/es-object-atoms": {
+      "version": "1.1.2",
+      "resolved": "https://registry.npmjs.org/es-object-atoms/-/es-object-atoms-1.1.2.tgz",
+      "integrity": "sha512-HWcBoN6NileqtSydK2FqHbS/LoDd2pqrnQHLyJzBj4kOp/ky2MWMN694xOfkK8/SnUsW2DH7EfyVlydKCsm1Zw==",
+      "license": "MIT",
+      "dependencies": {
+        "es-errors": "^1.3.0"
+      },
+      "engines": {
+        "node": ">= 0.4"
+      }
+    },
     "node_modules/escalade": {
       "version": "3.2.0",
       "resolved": "https://registry.npmjs.org/escalade/-/escalade-3.2.0.tgz",
       "integrity": "sha512-WUj2qlxaQtO4g6Pq5c29GTcWGDyd8itL8zTlipgECz3JesAiiOKotd8JU6otB3PACgG6xkJUyVhboMS+bje/jA==",
       "dev": true,
       "license": "MIT",
       "engines": {
         "node": ">=6"
       }
     },
+    "node_modules/escape-html": {
+      "version": "1.0.3",
+      "resolved": "https://registry.npmjs.org/escape-html/-/escape-html-1.0.3.tgz",
+      "integrity": "sha512-NiSupZ4OeuGwr68lGIeym/ksIZMJodUGOSCZ/FSnTxcrekbvqrgdUxlJOMpijaKZVjAJrWrGs/6Jy8OMuyj9ow==",
+      "license": "MIT"
+    },
     "node_modules/escape-string-regexp": {
       "version": "4.0.0",
       "resolved": "https://registry.npmjs.org/escape-string-regexp/-/escape-string-regexp-4.0.0.tgz",
       "integrity": "sha512-TtpcNJ3XAzx3Gq8sWRzJaVajRs0uVxA2YAkdb1jm2YkPz4G6egUFAyA3n5vtEIZefPk5Wa4UXbKuS5fKkJWdgA==",
       "dev": true,
       "license": "MIT",
       "engines": {
         "node": ">=10"
       },
       "funding": {
@@ -1429,20 +1663,90 @@
     "node_modules/esutils": {
       "version": "2.0.3",
       "resolved": "https://registry.npmjs.org/esutils/-/esutils-2.0.3.tgz",
       "integrity": "sha512-kVscqXk4OCp68SZ0dkgEKVi6/8ij300KBWTJq32P/dYeWTSwK41WyTxalN1eRmA5Z9UU/LX9D7FWSmV9SAYx6g==",
       "dev": true,
       "license": "BSD-2-Clause",
       "engines": {
         "node": ">=0.10.0"
       }
     },
+    "node_modules/etag": {
+      "version": "1.8.1",
+      "resolved": "https://registry.npmjs.org/etag/-/etag-1.8.1.tgz",
+      "integrity": "sha512-aIL5Fx7mawVa300al2BnEE4iNvo1qETxLrPI/o05L7z6go7fCw1J6EQmbK4FmJ2AS7kgVF/KEZWufBfdClMcPg==",
+      "license": "MIT",
+      "engines": {
+        "node": ">= 0.6"
+      }
+    },
+    "node_modules/express": {
+      "version": "4.22.3",
+      "resolved": "https://registry.npmjs.org/express/-/express-4.22.3.tgz",
+      "integrity": "sha512-Bdcs4+3qlpVlx2NRn6fgX2Ue2/gGRaPeawebgclM0ERSCqDpA+owF1fdPwjJUTAJWMTuAaxjDf+hzb0/4eKvvw==",
+      "license": "MIT",
+      "dependencies": {
+        "accepts": "~1.3.8",
+        "array-flatten": "1.1.1",
+        "body-parser": "~1.20.5",
+        "content-disposition": "~0.5.4",
+        "content-type": "~1.0.4",
+        "cookie": "~0.7.1",
+        "cookie-signature": "~1.0.6",
+        "debug": "2.6.9",
+        "depd": "2.0.0",
+        "encodeurl": "~2.0.0",
+        "escape-html": "~1.0.3",
+        "etag": "~1.8.1",
+        "finalhandler": "~1.3.1",
+        "fresh": "~0.5.2",
+        "http-errors": "~2.0.0",
+        "merge-descriptors": "1.0.3",
+        "methods": "~1.1.2",
+        "on-finished": "~2.4.1",
+        "parseurl": "~1.3.3",
+        "path-to-regexp": "~0.1.13",
+        "proxy-addr": "~2.0.7",
+        "qs": "~6.16.0",
+        "range-parser": "~1.2.1",
+        "safe-buffer": "5.2.1",
+        "send": "~0.19.0",
+        "serve-static": "~1.16.2",
+        "setprototypeof": "1.2.0",
+        "statuses": "~2.0.1",
+        "type-is": "~1.6.18",
+        "utils-merge": "1.0.1",
+        "vary": "~1.1.2"
+      },
+      "engines": {
+        "node": ">= 0.10.0"
+      },
+      "funding": {
+        "type": "opencollective",
+        "url": "https://opencollective.com/express"
+      }
+    },
+    "node_modules/express/node_modules/debug": {
+      "version": "2.6.9",
+      "resolved": "https://registry.npmjs.org/debug/-/debug-2.6.9.tgz",
+      "integrity": "sha512-bC7ElrdJaJnPbAP+1EotYvqZsb3ecl5wi6Bfi6BJTUcNowp6cvspg0jXznRTKDjm/E7AdgFBVeAPVMNcKGsHMA==",
+      "license": "MIT",
+      "dependencies": {
+        "ms": "2.0.0"
+      }
+    },
+    "node_modules/express/node_modules/ms": {
+      "version": "2.0.0",
+      "resolved": "https://registry.npmjs.org/ms/-/ms-2.0.0.tgz",
+      "integrity": "sha512-Tpp60P6IUJDTuOq/5Z8cdskzJujfwqfOTkrwIwj7IRISpnkJnT6SyJ4PCPnGMoFjC9ddhal5KVIYtAt97ix05A==",
+      "license": "MIT"
+    },
     "node_modules/fast-deep-equal": {
       "version": "3.1.3",
       "resolved": "https://registry.npmjs.org/fast-deep-equal/-/fast-deep-equal-3.1.3.tgz",
       "integrity": "sha512-f3qQ9oQy9j2AhBe/H9VC91wLmKBCCU/gDOnKNAYG5hswO7BLKj09Hc5HYNz9cGI++xlpDCIgDaitVs03ATR84Q==",
       "dev": true,
       "license": "MIT"
     },
     "node_modules/fast-json-stable-stringify": {
       "version": "2.1.0",
       "resolved": "https://registry.npmjs.org/fast-json-stable-stringify/-/fast-json-stable-stringify-2.1.0.tgz",
@@ -1481,20 +1785,53 @@
       "integrity": "sha512-XXTUwCvisa5oacNGRP9SfNtYBNAMi+RPwBFmblZEF7N7swHYQS6/Zfk7SRwx4D5j3CH211YNRco1DEMNVfZCnQ==",
       "dev": true,
       "license": "MIT",
       "dependencies": {
         "flat-cache": "^4.0.0"
       },
       "engines": {
         "node": ">=16.0.0"
       }
     },
+    "node_modules/finalhandler": {
+      "version": "1.3.2",
+      "resolved": "https://registry.npmjs.org/finalhandler/-/finalhandler-1.3.2.tgz",
+      "integrity": "sha512-aA4RyPcd3badbdABGDuTXCMTtOneUCAYH/gxoYRTZlIJdF0YPWuGqiAsIrhNnnqdXGswYk6dGujem4w80UJFhg==",
+      "license": "MIT",
+      "dependencies": {
+        "debug": "2.6.9",
+        "encodeurl": "~2.0.0",
+        "escape-html": "~1.0.3",
+        "on-finished": "~2.4.1",
+        "parseurl": "~1.3.3",
+        "statuses": "~2.0.2",
+        "unpipe": "~1.0.0"
+      },
+      "engines": {
+        "node": ">= 0.8"
+      }
+    },
+    "node_modules/finalhandler/node_modules/debug": {
+      "version": "2.6.9",
+      "resolved": "https://registry.npmjs.org/debug/-/debug-2.6.9.tgz",
+      "integrity": "sha512-bC7ElrdJaJnPbAP+1EotYvqZsb3ecl5wi6Bfi6BJTUcNowp6cvspg0jXznRTKDjm/E7AdgFBVeAPVMNcKGsHMA==",
+      "license": "MIT",
+      "dependencies": {
+        "ms": "2.0.0"
+      }
+    },
+    "node_modules/finalhandler/node_modules/ms": {
+      "version": "2.0.0",
+      "resolved": "https://registry.npmjs.org/ms/-/ms-2.0.0.tgz",
+      "integrity": "sha512-Tpp60P6IUJDTuOq/5Z8cdskzJujfwqfOTkrwIwj7IRISpnkJnT6SyJ4PCPnGMoFjC9ddhal5KVIYtAt97ix05A==",
+      "license": "MIT"
+    },
     "node_modules/find-up": {
       "version": "5.0.0",
       "resolved": "https://registry.npmjs.org/find-up/-/find-up-5.0.0.tgz",
       "integrity": "sha512-78/PXT1wlLLDgTzDs7sjq9hzz0vXD+zn+7wypEe4fXQxCmdmqfGsEPQxmiCSQI3ajFV91bVSsvNtrJRiW6nGng==",
       "dev": true,
       "license": "MIT",
       "dependencies": {
         "locate-path": "^6.0.0",
         "path-exists": "^4.0.0"
       },
@@ -1519,45 +1856,109 @@
         "node": ">=16"
       }
     },
     "node_modules/flatted": {
       "version": "3.4.2",
       "resolved": "https://registry.npmjs.org/flatted/-/flatted-3.4.2.tgz",
       "integrity": "sha512-PjDse7RzhcPkIJwy5t7KPWQSZ9cAbzQXcafsetQoD7sOJRQlGikNbx7yZp2OotDnJyrDcbyRq3Ttb18iYOqkxA==",
       "dev": true,
       "license": "ISC"
     },
+    "node_modules/forwarded": {
+      "version": "0.2.0",
+      "resolved": "https://registry.npmjs.org/forwarded/-/forwarded-0.2.0.tgz",
+      "integrity": "sha512-buRG0fpBtRHSTCOASe6hD258tEubFoRLb4ZNA6NxMVHNw2gOcwHo9wyablzMzOA5z9xA9L1KNjk/Nt6MT9aYow==",
+      "license": "MIT",
+      "engines": {
+        "node": ">= 0.6"
+      }
+    },
+    "node_modules/fresh": {
+      "version": "0.5.2",
+      "resolved": "https://registry.npmjs.org/fresh/-/fresh-0.5.2.tgz",
+      "integrity": "sha512-zJ2mQYM18rEFOudeV4GShTGIQ7RbzA7ozbU9I/XBpm7kqgMywgmylMwXHxZJmkVoYkna9d2pVXVXPdYTP9ej8Q==",
+      "license": "MIT",
+      "engines": {
+        "node": ">= 0.6"
+      }
+    },
     "node_modules/fsevents": {
       "version": "2.3.3",
       "resolved": "https://registry.npmjs.org/fsevents/-/fsevents-2.3.3.tgz",
       "integrity": "sha512-5xoDfX+fL7faATnagmWPpbFtwh/R77WmMMqqHGS65C3vvB0YHrgF+B1YmZ3441tMj5n63k0212XNoJwzlhffQw==",
       "dev": true,
       "hasInstallScript": true,
       "license": "MIT",
       "optional": true,
       "os": [
         "darwin"
       ],
       "engines": {
         "node": "^8.16.0 || ^10.6.0 || >=11.0.0"
       }
     },
+    "node_modules/function-bind": {
+      "version": "1.1.2",
+      "resolved": "https://registry.npmjs.org/function-bind/-/function-bind-1.1.2.tgz",
+      "integrity": "sha512-7XHNxH7qX9xG5mIwxkhumTox/MIRNcOgDrxWsMt2pAr23WHp6MrRlN7FBSFpCpr+oVO0F744iUgR82nJMfG2SA==",
+      "license": "MIT",
+      "funding": {
+        "url": "https://github.com/sponsors/ljharb"
+      }
+    },
     "node_modules/gensync": {
       "version": "1.0.0-beta.2",
       "resolved": "https://registry.npmjs.org/gensync/-/gensync-1.0.0-beta.2.tgz",
       "integrity": "sha512-3hN7NaskYvMDLQY55gnW3NQ+mesEAepTqlg+VEbj7zzqEMBVNhzcGYYeqFo/TlYz6eQiFcp1HcsCZO+nGgS8zg==",
       "dev": true,
       "license": "MIT",
       "engines": {
         "node": ">=6.9.0"
       }
     },
+    "node_modules/get-intrinsic": {
+      "version": "1.3.0",
+      "resolved": "https://registry.npmjs.org/get-intrinsic/-/get-intrinsic-1.3.0.tgz",
+      "integrity": "sha512-9fSjSaos/fRIVIp+xSJlE6lfwhES7LNtKaCBIamHsjr2na1BiABJPo0mOjjz8GJDURarmCPGqaiVg5mfjb98CQ==",
+      "license": "MIT",
+      "dependencies": {
+        "call-bind-apply-helpers": "^1.0.2",
+        "es-define-property": "^1.0.1",
+        "es-errors": "^1.3.0",
+        "es-object-atoms": "^1.1.1",
+        "function-bind": "^1.1.2",
+        "get-proto": "^1.0.1",
+        "gopd": "^1.2.0",
+        "has-symbols": "^1.1.0",
+        "hasown": "^2.0.2",
+        "math-intrinsics": "^1.1.0"
+      },
+      "engines": {
+        "node": ">= 0.4"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/ljharb"
+      }
+    },
+    "node_modules/get-proto": {
+      "version": "1.0.1",
+      "resolved": "https://registry.npmjs.org/get-proto/-/get-proto-1.0.1.tgz",
+      "integrity": "sha512-sTSfBjoXBp89JvIKIefqw7U2CCebsc74kiY6awiGogKtoSGbgjYE/G/+l9sF3MWFPNc9IcoOC4ODfKHfxFmp0g==",
+      "license": "MIT",
+      "dependencies": {
+        "dunder-proto": "^1.0.1",
+        "es-object-atoms": "^1.0.0"
+      },
+      "engines": {
+        "node": ">= 0.4"
+      }
+    },
     "node_modules/glob-parent": {
       "version": "6.0.2",
       "resolved": "https://registry.npmjs.org/glob-parent/-/glob-parent-6.0.2.tgz",
       "integrity": "sha512-XxwI8EOhVQgWp6iDL+3b0r86f4d6AX6zSU55HfB4ydCEuXLXc5FcYeOu+nnGftS4TEju/11rt4KJPTMgbfmv4A==",
       "dev": true,
       "license": "ISC",
       "dependencies": {
         "is-glob": "^4.0.3"
       },
       "engines": {
@@ -1570,47 +1971,115 @@
       "integrity": "sha512-qoV+HK2yFl/366t2/Cb3+xxPUo5BuMynomoDmiaZBIdbs+0pYbjfZU+twLhGKp4uCZ/+NbtpVepH5bGCxRyy2g==",
       "dev": true,
       "license": "MIT",
       "engines": {
         "node": ">=18"
       },
       "funding": {
         "url": "https://github.com/sponsors/sindresorhus"
       }
     },
+    "node_modules/gopd": {
+      "version": "1.2.0",
+      "resolved": "https://registry.npmjs.org/gopd/-/gopd-1.2.0.tgz",
+      "integrity": "sha512-ZUKRh6/kUFoAiTAtTYPZJ3hw9wNxx+BIBOijnlG9PnrJsCcSjs1wyyD6vJpaYtgnzDrKYRSqf3OO6Rfa93xsRg==",
+      "license": "MIT",
+      "engines": {
+        "node": ">= 0.4"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/ljharb"
+      }
+    },
     "node_modules/has-flag": {
       "version": "4.0.0",
       "resolved": "https://registry.npmjs.org/has-flag/-/has-flag-4.0.0.tgz",
       "integrity": "sha512-EykJT/Q1KjTWctppgIAgfSO0tKVuZUjhgMr17kqTumMl6Afv3EISleU7qZUzoXDFTAHTDC4NOoG/ZxU3EvlMPQ==",
       "dev": true,
       "license": "MIT",
       "engines": {
         "node": ">=8"
       }
     },
+    "node_modules/has-symbols": {
+      "version": "1.1.0",
+      "resolved": "https://registry.npmjs.org/has-symbols/-/has-symbols-1.1.0.tgz",
+      "integrity": "sha512-1cDNdwJ2Jaohmb3sg4OmKaMBwuC48sYni5HUw2DvsC8LjGTLK9h+eb1X6RyuOHe4hT0ULCW68iomhjUoKUqlPQ==",
+      "license": "MIT",
+      "engines": {
+        "node": ">= 0.4"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/ljharb"
+      }
+    },
+    "node_modules/hasown": {
+      "version": "2.0.4",
+      "resolved": "https://registry.npmjs.org/hasown/-/hasown-2.0.4.tgz",
+      "integrity": "sha512-T2UbfbBEF32wiepXIsMlTW9+dDYC6wMh/t/vYA4tuOMKqWz/n3vr1NFSxQiyP+zk2mXsoMA/i/7qV6LKut1t1A==",
+      "license": "MIT",
+      "dependencies": {
+        "function-bind": "^1.1.2"
+      },
+      "engines": {
+        "node": ">= 0.4"
+      }
+    },
     "node_modules/hermes-estree": {
       "version": "0.25.1",
       "resolved": "https://registry.npmjs.org/hermes-estree/-/hermes-estree-0.25.1.tgz",
       "integrity": "sha512-0wUoCcLp+5Ev5pDW2OriHC2MJCbwLwuRx+gAqMTOkGKJJiBCLjtrvy4PWUGn6MIVefecRpzoOZ/UV6iGdOr+Cw==",
       "dev": true,
       "license": "MIT"
     },
     "node_modules/hermes-parser": {
       "version": "0.25.1",
       "resolved": "https://registry.npmjs.org/hermes-parser/-/hermes-parser-0.25.1.tgz",
       "integrity": "sha512-6pEjquH3rqaI6cYAXYPcz9MS4rY6R4ngRgrgfDshRptUZIc3lw0MCIJIGDj9++mfySOuPTHB4nrSW99BCvOPIA==",
       "dev": true,
       "license": "MIT",
       "dependencies": {
         "hermes-estree": "0.25.1"
       }
     },
+    "node_modules/http-errors": {
+      "version": "2.0.1",
+      "resolved": "https://registry.npmjs.org/http-errors/-/http-errors-2.0.1.tgz",
+      "integrity": "sha512-4FbRdAX+bSdmo4AUFuS0WNiPz8NgFt+r8ThgNWmlrjQjt1Q7ZR9+zTlce2859x4KSXrwIsaeTqDoKQmtP8pLmQ==",
+      "license": "MIT",
+      "dependencies": {
+        "depd": "~2.0.0",
+        "inherits": "~2.0.4",
+        "setprototypeof": "~1.2.0",
+        "statuses": "~2.0.2",
+        "toidentifier": "~1.0.1"
+      },
+      "engines": {
+        "node": ">= 0.8"
+      },
+      "funding": {
+        "type": "opencollective",
+        "url": "https://opencollective.com/express"
+      }
+    },
+    "node_modules/iconv-lite": {
+      "version": "0.4.24",
+      "resolved": "https://registry.npmjs.org/iconv-lite/-/iconv-lite-0.4.24.tgz",
+      "integrity": "sha512-v3MXnZAcvnywkTUEZomIActle7RXXeedOR31wwl7VlyoXO4Qi9arvSenNQWne1TcRwhCL1HwLI21bEqdpj8/rA==",
+      "license": "MIT",
+      "dependencies": {
+        "safer-buffer": ">= 2.1.2 < 3"
+      },
+      "engines": {
+        "node": ">=0.10.0"
+      }
+    },
     "node_modules/ignore": {
       "version": "5.3.2",
       "resolved": "https://registry.npmjs.org/ignore/-/ignore-5.3.2.tgz",
       "integrity": "sha512-hsBTNUqQTDwkWtcdYI2i06Y/nUBEsNEDJKjWdigLvegy8kDuJAS8uRlpkkcQpyEXL0Z/pjDy5HBmMjRCJ2gq+g==",
       "dev": true,
       "license": "MIT",
       "engines": {
         "node": ">= 4"
       }
     },
@@ -1634,20 +2103,35 @@
     "node_modules/imurmurhash": {
       "version": "0.1.4",
       "resolved": "https://registry.npmjs.org/imurmurhash/-/imurmurhash-0.1.4.tgz",
       "integrity": "sha512-JmXMZ6wuvDmLiHEml9ykzqO6lwFbof0GG4IkcGaENdCRDDmMVnny7s5HsIgHCbaq0w2MyPhDqkhTUgS2LU2PHA==",
       "dev": true,
       "license": "MIT",
       "engines": {
         "node": ">=0.8.19"
       }
     },
+    "node_modules/inherits": {
+      "version": "2.0.4",
+      "resolved": "https://registry.npmjs.org/inherits/-/inherits-2.0.4.tgz",
+      "integrity": "sha512-k/vGaX4/Yla3WzyMCvTQOXYeIHvqOKtnqBduzTHpzpQZzAskKMhZ2K+EnBiSM9zGSoIFeMpXKxa4dYeZIQqewQ==",
+      "license": "ISC"
+    },
+    "node_modules/ipaddr.js": {
+      "version": "1.9.1",
+      "resolved": "https://registry.npmjs.org/ipaddr.js/-/ipaddr.js-1.9.1.tgz",
+      "integrity": "sha512-0KI/607xoxSToH7GjN1FfSbLoU0+btTicjsQSWQlh/hZykN8KpmMf7uYwPW3R+akZ6R/w18ZlXSHBYXiYUPO3g==",
+      "license": "MIT",
+      "engines": {
+        "node": ">= 0.10"
+      }
+    },
     "node_modules/is-extglob": {
       "version": "2.1.1",
       "resolved": "https://registry.npmjs.org/is-extglob/-/is-extglob-2.1.1.tgz",
       "integrity": "sha512-SbKbANkN603Vi4jEZv49LeVJMn4yGwsbzZworEoyEiutsN3nJYdbO36zfhGJ6QEDpOZIFkDtnq5JRxmvl3jsoQ==",
       "dev": true,
       "license": "MIT",
       "engines": {
         "node": ">=0.10.0"
       }
     },
@@ -2049,38 +2533,106 @@
     "node_modules/lru-cache": {
       "version": "5.1.1",
       "resolved": "https://registry.npmjs.org/lru-cache/-/lru-cache-5.1.1.tgz",
       "integrity": "sha512-KpNARQA3Iwv+jTA0utUVVbrh+Jlrr1Fv0e56GGzAFOXN7dk/FviaDW8LHmK52DlcH4WP2n6gI8vN1aesBFgo9w==",
       "dev": true,
       "license": "ISC",
       "dependencies": {
         "yallist": "^3.0.2"
       }
     },
+    "node_modules/math-intrinsics": {
+      "version": "1.1.0",
+      "resolved": "https://registry.npmjs.org/math-intrinsics/-/math-intrinsics-1.1.0.tgz",
+      "integrity": "sha512-/IXtbwEk5HTPyEwyKX6hGkYXxM9nbj64B+ilVJnC/R6B0pH5G4V3b0pVbL7DBj4tkhBAppbQUlf6F6Xl9LHu1g==",
+      "license": "MIT",
+      "engines": {
+        "node": ">= 0.4"
+      }
+    },
+    "node_modules/media-typer": {
+      "version": "0.3.0",
+      "resolved": "https://registry.npmjs.org/media-typer/-/media-typer-0.3.0.tgz",
+      "integrity": "sha512-dq+qelQ9akHpcOl/gUVRTxVIOkAJ1wR3QAvb4RsVjS8oVoFjDGTc679wJYmUmknUF5HwMLOgb5O+a3KxfWapPQ==",
+      "license": "MIT",
+      "engines": {
+        "node": ">= 0.6"
+      }
+    },
+    "node_modules/merge-descriptors": {
+      "version": "1.0.3",
+      "resolved": "https://registry.npmjs.org/merge-descriptors/-/merge-descriptors-1.0.3.tgz",
+      "integrity": "sha512-gaNvAS7TZ897/rVaZ0nMtAyxNyi/pdbjbAwUpFQpN70GqnVfOiXpeUUMKRBmzXaSQ8DdTX4/0ms62r2K+hE6mQ==",
+      "license": "MIT",
+      "funding": {
+        "url": "https://github.com/sponsors/sindresorhus"
+      }
+    },
+    "node_modules/methods": {
+      "version": "1.1.2",
+      "resolved": "https://registry.npmjs.org/methods/-/methods-1.1.2.tgz",
+      "integrity": "sha512-iclAHeNqNm68zFtnZ0e+1L2yUIdvzNoauKU4WBA3VvH/vPFieF7qfRlwUZU+DA9P9bPXIS90ulxoUoCH23sV2w==",
+      "license": "MIT",
+      "engines": {
+        "node": ">= 0.6"
+      }
+    },
+    "node_modules/mime": {
+      "version": "1.6.0",
+      "resolved": "https://registry.npmjs.org/mime/-/mime-1.6.0.tgz",
+      "integrity": "sha512-x0Vn8spI+wuJ1O6S7gnbaQg8Pxh4NNHb7KSINmEWKiPE4RKOplvijn+NkmYmmRgP68mc70j2EbeTFRsrswaQeg==",
+      "license": "MIT",
+      "bin": {
+        "mime": "cli.js"
+      },
+      "engines": {
+        "node": ">=4"
+      }
+    },
+    "node_modules/mime-db": {
+      "version": "1.52.0",
+      "resolved": "https://registry.npmjs.org/mime-db/-/mime-db-1.52.0.tgz",
+      "integrity": "sha512-sPU4uV7dYlvtWJxwwxHD0PuihVNiE7TyAbQ5SWxDCB9mUYvOgroQOwYQQOKPJ8CIbE+1ETVlOoK1UC2nU3gYvg==",
+      "license": "MIT",
+      "engines": {
+        "node": ">= 0.6"
+      }
+    },
+    "node_modules/mime-types": {
+      "version": "2.1.35",
+      "resolved": "https://registry.npmjs.org/mime-types/-/mime-types-2.1.35.tgz",
+      "integrity": "sha512-ZDY+bPm5zTTF+YpCrAU9nK0UgICYPT0QtT1NZWFv4s++TNkcgVaT0g6+4R2uI4MjQjzysHB1zxuWL50hzaeXiw==",
+      "license": "MIT",
+      "dependencies": {
+        "mime-db": "1.52.0"
+      },
+      "engines": {
+        "node": ">= 0.6"
+      }
+    },
     "node_modules/minimatch": {
       "version": "3.1.5",
       "resolved": "https://registry.npmjs.org/minimatch/-/minimatch-3.1.5.tgz",
       "integrity": "sha512-VgjWUsnnT6n+NUk6eZq77zeFdpW2LWDzP6zFGrCbHXiYNul5Dzqk2HHQ5uFH2DNW5Xbp8+jVzaeNt94ssEEl4w==",
       "dev": true,
       "license": "ISC",
       "dependencies": {
         "brace-expansion": "^1.1.7"
       },
       "engines": {
         "node": "*"
       }
     },
     "node_modules/ms": {
       "version": "2.1.3",
       "resolved": "https://registry.npmjs.org/ms/-/ms-2.1.3.tgz",
       "integrity": "sha512-6FlzubTLZG3J2a/NVCAleEhjzq5oxgHyaCU9yYXvcLsvoVaHJq/s5xXI6/XXP6tz7R9xAOtHnSO/tXtF3WRTlA==",
-      "dev": true,
       "license": "MIT"
     },
     "node_modules/nanoid": {
       "version": "3.3.11",
       "resolved": "https://registry.npmjs.org/nanoid/-/nanoid-3.3.11.tgz",
       "integrity": "sha512-N8SpfPUnUp1bK+PMYW8qSWdl9U+wwNWI4QKxOYDy9JAro3WMX7p2OeVRF9v+347pnakNevPmiHhNmZ2HbFA76w==",
       "dev": true,
       "funding": [
         {
           "type": "github",
@@ -2095,27 +2647,60 @@
         "node": "^10 || ^12 || ^13.7 || ^14 || >=15.0.1"
       }
     },
     "node_modules/natural-compare": {
       "version": "1.4.0",
       "resolved": "https://registry.npmjs.org/natural-compare/-/natural-compare-1.4.0.tgz",
       "integrity": "sha512-OWND8ei3VtNC9h7V60qff3SVobHr996CTwgxubgyQYEpg290h9J0buyECNNJexkFm5sOajh5G116RYA1c8ZMSw==",
       "dev": true,
       "license": "MIT"
     },
+    "node_modules/negotiator": {
+      "version": "0.6.3",
+      "resolved": "https://registry.npmjs.org/negotiator/-/negotiator-0.6.3.tgz",
+      "integrity": "sha512-+EUsqGPLsM+j/zdChZjsnX51g4XrHFOIXwfnCVPGlQk/k5giakcKsuxCObBRu6DSm9opw/O6slWbJdghQM4bBg==",
+      "license": "MIT",
+      "engines": {
+        "node": ">= 0.6"
+      }
+    },
     "node_modules/node-releases": {
       "version": "2.0.37",
       "resolved": "https://registry.npmjs.org/node-releases/-/node-releases-2.0.37.tgz",
       "integrity": "sha512-1h5gKZCF+pO/o3Iqt5Jp7wc9rH3eJJ0+nh/CIoiRwjRxde/hAHyLPXYN4V3CqKAbiZPSeJFSWHmJsbkicta0Eg==",
       "dev": true,
       "license": "MIT"
     },
+    "node_modules/object-inspect": {
+      "version": "1.13.4",
+      "resolved": "https://registry.npmjs.org/object-inspect/-/object-inspect-1.13.4.tgz",
+      "integrity": "sha512-W67iLl4J2EXEGTbfeHCffrjDfitvLANg0UlX3wFUUSTx92KXRFegMHUVgSqE+wvhAbi4WqjGg9czysTV2Epbew==",
+      "license": "MIT",
+      "engines": {
+        "node": ">= 0.4"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/ljharb"
+      }
+    },
+    "node_modules/on-finished": {
+      "version": "2.4.1",
+      "resolved": "https://registry.npmjs.org/on-finished/-/on-finished-2.4.1.tgz",
+      "integrity": "sha512-oVlzkg3ENAhCk2zdv7IJwd/QUD4z2RxRwpkcGY8psCVcCYZNq4wYnVWALHM+brtuJjePWiYF/ClmuDr8Ch5+kg==",
+      "license": "MIT",
+      "dependencies": {
+        "ee-first": "1.1.1"
+      },
+      "engines": {
+        "node": ">= 0.8"
+      }
+    },
     "node_modules/optionator": {
       "version": "0.9.4",
       "resolved": "https://registry.npmjs.org/optionator/-/optionator-0.9.4.tgz",
       "integrity": "sha512-6IpQ7mKUxRcZNLIObR0hz7lxsapSSIYNZJwXPGeF0mTVqGKFIXj1DQcMoT22S3ROcLyY/rz0PWaWZ9ayWmad9g==",
       "dev": true,
       "license": "MIT",
       "dependencies": {
         "deep-is": "^0.1.3",
         "fast-levenshtein": "^2.0.6",
         "levn": "^0.4.1",
@@ -2182,40 +2767,144 @@
       "integrity": "sha512-GQ2EWRpQV8/o+Aw8YqtfZZPfNRWZYkbidE9k5rpl/hC3vtHHBfGm2Ifi6qWV+coDGkrUKZAxE3Lot5kcsRlh+g==",
       "dev": true,
       "license": "MIT",
       "dependencies": {
         "callsites": "^3.0.0"
       },
       "engines": {
         "node": ">=6"
       }
     },
+    "node_modules/parseurl": {
+      "version": "1.3.3",
+      "resolved": "https://registry.npmjs.org/parseurl/-/parseurl-1.3.3.tgz",
+      "integrity": "sha512-CiyeOxFT/JZyN5m0z9PfXw4SCBJ6Sygz1Dpl0wqjlhDEGGBP1GnsUVEL0p63hoG1fcj3fHynXi9NYO4nWOL+qQ==",
+      "license": "MIT",
+      "engines": {
+        "node": ">= 0.8"
+      }
+    },
     "node_modules/path-exists": {
       "version": "4.0.0",
       "resolved": "https://registry.npmjs.org/path-exists/-/path-exists-4.0.0.tgz",
       "integrity": "sha512-ak9Qy5Q7jYb2Wwcey5Fpvg2KoAc/ZIhLSLOSBmRmygPsGwkVVt0fZa0qrtMz+m6tJTAHfZQ8FnmB4MG4LWy7/w==",
       "dev": true,
       "license": "MIT",
       "engines": {
         "node": ">=8"
       }
     },
     "node_modules/path-key": {
       "version": "3.1.1",
       "resolved": "https://registry.npmjs.org/path-key/-/path-key-3.1.1.tgz",
       "integrity": "sha512-ojmeN0qd+y0jszEtoY48r0Peq5dwMEkIlCOu6Q5f41lfkswXuKtYrhgoTpLnyIcHm24Uhqx+5Tqm2InSwLhE6Q==",
       "dev": true,
       "license": "MIT",
       "engines": {
         "node": ">=8"
       }
     },
+    "node_modules/path-to-regexp": {
+      "version": "0.1.13",
+      "resolved": "https://registry.npmjs.org/path-to-regexp/-/path-to-regexp-0.1.13.tgz",
+      "integrity": "sha512-A/AGNMFN3c8bOlvV9RreMdrv7jsmF9XIfDeCd87+I8RNg6s78BhJxMu69NEMHBSJFxKidViTEdruRwEk/WIKqA==",
+      "license": "MIT"
+    },
+    "node_modules/pg": {
+      "version": "8.23.1",
+      "resolved": "https://registry.npmjs.org/pg/-/pg-8.23.1.tgz",
+      "integrity": "sha512-aL96AHANtWjPLDOLqnhx+ngp9+UK7ETEU8VJrDCGvsSSi/mGLcWYsS6Herg7lmaBJe4uwrfqsa7gTEFaSizDoQ==",
+      "license": "MIT",
+      "dependencies": {
+        "pg-connection-string": "^2.14.1",
+        "pg-pool": "^3.14.0",
+        "pg-protocol": "^1.16.1",
+        "pg-types": "2.2.0",
+        "pgpass": "1.0.5"
+      },
+      "engines": {
+        "node": ">= 16.0.0"
+      },
+      "optionalDependencies": {
+        "pg-cloudflare": "^1.4.1"
+      },
+      "peerDependencies": {
+        "pg-native": ">=3.0.1"
+      },
+      "peerDependenciesMeta": {
+        "pg-native": {
+          "optional": true
+        }
+      }
+    },
+    "node_modules/pg-cloudflare": {
+      "version": "1.4.1",
+      "resolved": "https://registry.npmjs.org/pg-cloudflare/-/pg-cloudflare-1.4.1.tgz",
+      "integrity": "sha512-6PQbsFWZcp9EmJEwy5cGQ2La+AMWpP46lgbb8X+U/XsHIUweYDNCpeuKck5RxL2MdVFi7krbbEi5nX4Zh7JhrQ==",
+      "license": "MIT",
+      "optional": true
+    },
+    "node_modules/pg-connection-string": {
+      "version": "2.14.1",
+      "resolved": "https://registry.npmjs.org/pg-connection-string/-/pg-connection-string-2.14.1.tgz",
+      "integrity": "sha512-qR3kGNPBLpCNtz0evbKA0Y/MRFXwSSdT+pTJvYp/bXTcReZbvX1kzF0IyTc1QnxqF7AZbOeBhNL8R5mYQZV/MA==",
+      "license": "MIT"
+    },
+    "node_modules/pg-int8": {
+      "version": "1.0.1",
+      "resolved": "https://registry.npmjs.org/pg-int8/-/pg-int8-1.0.1.tgz",
+      "integrity": "sha512-WCtabS6t3c8SkpDBUlb1kjOs7l66xsGdKpIPZsg4wR+B3+u9UAum2odSsF9tnvxg80h4ZxLWMy4pRjOsFIqQpw==",
+      "license": "ISC",
+      "engines": {
+        "node": ">=4.0.0"
+      }
+    },
+    "node_modules/pg-pool": {
+      "version": "3.14.0",
+      "resolved": "https://registry.npmjs.org/pg-pool/-/pg-pool-3.14.0.tgz",
+      "integrity": "sha512-gKtPkFdQPU3DksooVLi9LsjZxrsBUZIpa+7aVx+LV5pNh0KzP4Zleud2po+ConrxbuXGBJ6Hfer6hdgpIBpBaw==",
+      "license": "MIT",
+      "peerDependencies": {
+        "pg": ">=8.0"
+      }
+    },
+    "node_modules/pg-protocol": {
+      "version": "1.16.1",
+      "resolved": "https://registry.npmjs.org/pg-protocol/-/pg-protocol-1.16.1.tgz",
+      "integrity": "sha512-p9VOFMiHB/ZbJATetbg+99PxssTVSQRnyuPSQ67mN1+1KBOjZaZ83ZQzltnxPhJwSsC3nwVjJ10DVJlerbFzLg==",
+      "license": "MIT"
+    },
+    "node_modules/pg-types": {
+      "version": "2.2.0",
+      "resolved": "https://registry.npmjs.org/pg-types/-/pg-types-2.2.0.tgz",
+      "integrity": "sha512-qTAAlrEsl8s4OiEQY69wDvcMIdQN6wdz5ojQiOy6YRMuynxenON0O5oCpJI6lshc6scgAY8qvJ2On/p+CXY0GA==",
+      "license": "MIT",
+      "dependencies": {
+        "pg-int8": "1.0.1",
+        "postgres-array": "~2.0.0",
+        "postgres-bytea": "~1.0.0",
+        "postgres-date": "~1.0.4",
+        "postgres-interval": "^1.1.0"
+      },
+      "engines": {
+        "node": ">=4"
+      }
+    },
+    "node_modules/pgpass": {
+      "version": "1.0.5",
+      "resolved": "https://registry.npmjs.org/pgpass/-/pgpass-1.0.5.tgz",
+      "integrity": "sha512-FdW9r/jQZhSeohs1Z3sI1yxFQNFvMcnmfuj4WBMUTxOrAyLMaTcE1aAMBiTlbMNaXvBCQuVi0R7hd8udDSP7ug==",
+      "license": "MIT",
+      "dependencies": {
+        "split2": "^4.1.0"
+      }
+    },
     "node_modules/picocolors": {
       "version": "1.1.1",
       "resolved": "https://registry.npmjs.org/picocolors/-/picocolors-1.1.1.tgz",
       "integrity": "sha512-xceH2snhtb5M9liqDsmEw56le376mTZkEX/jEb/RxNFyegNul7eNslCXP9FDj/Lcu0X8KEyMceP2ntpaHrDEVA==",
       "dev": true,
       "license": "ISC"
     },
     "node_modules/picomatch": {
       "version": "4.0.4",
       "resolved": "https://registry.npmjs.org/picomatch/-/picomatch-4.0.4.tgz",
@@ -2261,40 +2950,136 @@
       "license": "MIT",
       "dependencies": {
         "nanoid": "^3.3.11",
         "picocolors": "^1.1.1",
         "source-map-js": "^1.2.1"
       },
       "engines": {
         "node": "^10 || ^12 || >=14"
       }
     },
+    "node_modules/postgres-array": {
+      "version": "2.0.0",
+      "resolved": "https://registry.npmjs.org/postgres-array/-/postgres-array-2.0.0.tgz",
+      "integrity": "sha512-VpZrUqU5A69eQyW2c5CA1jtLecCsN2U/bD6VilrFDWq5+5UIEVO7nazS3TEcHf1zuPYO/sqGvUvW62g86RXZuA==",
+      "license": "MIT",
+      "engines": {
+        "node": ">=4"
+      }
+    },
+    "node_modules/postgres-bytea": {
+      "version": "1.0.1",
+      "resolved": "https://registry.npmjs.org/postgres-bytea/-/postgres-bytea-1.0.1.tgz",
+      "integrity": "sha512-5+5HqXnsZPE65IJZSMkZtURARZelel2oXUEO8rH83VS/hxH5vv1uHquPg5wZs8yMAfdv971IU+kcPUczi7NVBQ==",
+      "license": "MIT",
+      "engines": {
+        "node": ">=0.10.0"
+      }
+    },
+    "node_modules/postgres-date": {
+      "version": "1.0.7",
+      "resolved": "https://registry.npmjs.org/postgres-date/-/postgres-date-1.0.7.tgz",
+      "integrity": "sha512-suDmjLVQg78nMK2UZ454hAG+OAW+HQPZ6n++TNDUX+L0+uUlLywnoxJKDou51Zm+zTCjrCl0Nq6J9C5hP9vK/Q==",
+      "license": "MIT",
+      "engines": {
+        "node": ">=0.10.0"
+      }
+    },
+    "node_modules/postgres-interval": {
+      "version": "1.2.0",
+      "resolved": "https://registry.npmjs.org/postgres-interval/-/postgres-interval-1.2.0.tgz",
+      "integrity": "sha512-9ZhXKM/rw350N1ovuWHbGxnGh/SNJ4cnxHiM0rxE4VN41wsg8P8zWn9hv/buK00RP4WvlOyr/RBDiptyxVbkZQ==",
+      "license": "MIT",
+      "dependencies": {
+        "xtend": "^4.0.0"
+      },
+      "engines": {
+        "node": ">=0.10.0"
+      }
+    },
     "node_modules/prelude-ls": {
       "version": "1.2.1",
       "resolved": "https://registry.npmjs.org/prelude-ls/-/prelude-ls-1.2.1.tgz",
       "integrity": "sha512-vkcDPrRZo1QZLbn5RLGPpg/WmIQ65qoWWhcGKf/b5eplkkarX0m9z8ppCat4mlOqUsWpyNuYgO3VRyrYHSzX5g==",
       "dev": true,
       "license": "MIT",
       "engines": {
         "node": ">= 0.8.0"
       }
     },
+    "node_modules/proxy-addr": {
+      "version": "2.0.8",
+      "resolved": "https://registry.npmjs.org/proxy-addr/-/proxy-addr-2.0.8.tgz",
+      "integrity": "sha512-5nnx0yGyVUcY6t9RnWcARWtwT9F1D8O9rt08htPvnd49W1IgZtmLkhu9WfMzQj1cFxjHIO6connUNVW5k7AVyQ==",
+      "license": "MIT",
+      "dependencies": {
+        "forwarded": "0.2.0",
+        "ipaddr.js": "1.9.1"
+      },
+      "engines": {
+        "node": ">= 0.10"
+      },
+      "funding": {
+        "type": "opencollective",
+        "url": "https://opencollective.com/express"
+      }
+    },
     "node_modules/punycode": {
       "version": "2.3.1",
       "resolved": "https://registry.npmjs.org/punycode/-/punycode-2.3.1.tgz",
       "integrity": "sha512-vYt7UD1U9Wg6138shLtLOvdAu+8DsC/ilFtEVHcH+wydcSpNE20AfSOduf6MkRFahL5FY7X1oU7nKVZFtfq8Fg==",
       "dev": true,
       "license": "MIT",
       "engines": {
         "node": ">=6"
       }
     },
+    "node_modules/qs": {
+      "version": "6.16.0",
+      "resolved": "https://registry.npmjs.org/qs/-/qs-6.16.0.tgz",
+      "integrity": "sha512-h6fhOIaRrID2CbEY2fqs+7t+UXZo+MLAnU5gRIq85uFtdiUPCdsApMlHhXogKVM4HM2DVbIjGNTTYH2OcmP1vA==",
+      "license": "BSD-3-Clause",
+      "dependencies": {
+        "es-define-property": "^1.0.1",
+        "side-channel": "^1.1.1"
+      },
+      "engines": {
+        "node": ">=0.6"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/ljharb"
+      }
+    },
+    "node_modules/range-parser": {
+      "version": "1.2.1",
+      "resolved": "https://registry.npmjs.org/range-parser/-/range-parser-1.2.1.tgz",
+      "integrity": "sha512-Hrgsx+orqoygnmhFbKaHE6c296J+HTAQXoxEF6gNupROmmGJRoyzfG3ccAveqCBrwr/2yxQ5BVd/GTl5agOwSg==",
+      "license": "MIT",
+      "engines": {
+        "node": ">= 0.6"
+      }
+    },
+    "node_modules/raw-body": {
+      "version": "2.5.3",
+      "resolved": "https://registry.npmjs.org/raw-body/-/raw-body-2.5.3.tgz",
+      "integrity": "sha512-s4VSOf6yN0rvbRZGxs8Om5CWj6seneMwK3oDb4lWDH0UPhWcxwOWw5+qk24bxq87szX1ydrwylIOp2uG1ojUpA==",
+      "license": "MIT",
+      "dependencies": {
+        "bytes": "~3.1.2",
+        "http-errors": "~2.0.1",
+        "iconv-lite": "~0.4.24",
+        "unpipe": "~1.0.0"
+      },
+      "engines": {
+        "node": ">= 0.8"
+      }
+    },
     "node_modules/react": {
       "version": "19.2.5",
       "resolved": "https://registry.npmjs.org/react/-/react-19.2.5.tgz",
       "integrity": "sha512-llUJLzz1zTUBrskt2pwZgLq59AemifIftw4aB7JxOqf1HY2FDaGDxgwpAPVzHU1kdWabH7FauP4i1oEeer2WCA==",
       "license": "MIT",
       "engines": {
         "node": ">=0.10.0"
       }
     },
     "node_modules/react-dom": {
@@ -2353,36 +3138,122 @@
         "@rolldown/binding-win32-x64-msvc": "1.0.0-rc.15"
       }
     },
     "node_modules/rolldown/node_modules/@rolldown/pluginutils": {
       "version": "1.0.0-rc.15",
       "resolved": "https://registry.npmjs.org/@rolldown/pluginutils/-/pluginutils-1.0.0-rc.15.tgz",
       "integrity": "sha512-UromN0peaE53IaBRe9W7CjrZgXl90fqGpK+mIZbA3qSTeYqg3pqpROBdIPvOG3F5ereDHNwoHBI2e50n1BDr1g==",
       "dev": true,
       "license": "MIT"
     },
+    "node_modules/safe-buffer": {
+      "version": "5.2.1",
+      "resolved": "https://registry.npmjs.org/safe-buffer/-/safe-buffer-5.2.1.tgz",
+      "integrity": "sha512-rp3So07KcdmmKbGvgaNxQSJr7bGVSVk5S9Eq1F+ppbRo70+YeaDxkw5Dd8NPN+GD6bjnYm2VuPuCXmpuYvmCXQ==",
+      "funding": [
+        {
+          "type": "github",
+          "url": "https://github.com/sponsors/feross"
+        },
+        {
+          "type": "patreon",
+          "url": "https://www.patreon.com/feross"
+        },
+        {
+          "type": "consulting",
+          "url": "https://feross.org/support"
+        }
+      ],
+      "license": "MIT"
+    },
+    "node_modules/safer-buffer": {
+      "version": "2.1.2",
+      "resolved": "https://registry.npmjs.org/safer-buffer/-/safer-buffer-2.1.2.tgz",
+      "integrity": "sha512-YZo3K82SD7Riyi0E1EQPojLz7kpepnSQI9IyPbHHg1XXXevb5dJI7tpyN2ADxGcQbHG7vcyRHk0cbwqcQriUtg==",
+      "license": "MIT"
+    },
     "node_modules/scheduler": {
       "version": "0.27.0",
       "resolved": "https://registry.npmjs.org/scheduler/-/scheduler-0.27.0.tgz",
       "integrity": "sha512-eNv+WrVbKu1f3vbYJT/xtiF5syA5HPIMtf9IgY/nKg0sWqzAUEvqY/xm7OcZc/qafLx/iO9FgOmeSAp4v5ti/Q==",
       "license": "MIT"
     },
     "node_modules/semver": {
       "version": "6.3.1",
       "resolved": "https://registry.npmjs.org/semver/-/semver-6.3.1.tgz",
       "integrity": "sha512-BR7VvDCVHO+q2xBEWskxS6DJE1qRnb7DxzUrogb71CWoSficBxYsiAGd+Kl0mmq/MprG9yArRkyrQxTO6XjMzA==",
       "dev": true,
       "license": "ISC",
       "bin": {
         "semver": "bin/semver.js"
       }
     },
+    "node_modules/send": {
+      "version": "0.19.2",
+      "resolved": "https://registry.npmjs.org/send/-/send-0.19.2.tgz",
+      "integrity": "sha512-VMbMxbDeehAxpOtWJXlcUS5E8iXh6QmN+BkRX1GARS3wRaXEEgzCcB10gTQazO42tpNIya8xIyNx8fll1OFPrg==",
+      "license": "MIT",
+      "dependencies": {
+        "debug": "2.6.9",
+        "depd": "2.0.0",
+        "destroy": "1.2.0",
+        "encodeurl": "~2.0.0",
+        "escape-html": "~1.0.3",
+        "etag": "~1.8.1",
+        "fresh": "~0.5.2",
+        "http-errors": "~2.0.1",
+        "mime": "1.6.0",
+        "ms": "2.1.3",
+        "on-finished": "~2.4.1",
+        "range-parser": "~1.2.1",
+        "statuses": "~2.0.2"
+      },
+      "engines": {
+        "node": ">= 0.8.0"
+      }
+    },
+    "node_modules/send/node_modules/debug": {
+      "version": "2.6.9",
+      "resolved": "https://registry.npmjs.org/debug/-/debug-2.6.9.tgz",
+      "integrity": "sha512-bC7ElrdJaJnPbAP+1EotYvqZsb3ecl5wi6Bfi6BJTUcNowp6cvspg0jXznRTKDjm/E7AdgFBVeAPVMNcKGsHMA==",
+      "license": "MIT",
+      "dependencies": {
+        "ms": "2.0.0"
+      }
+    },
+    "node_modules/send/node_modules/debug/node_modules/ms": {
+      "version": "2.0.0",
+      "resolved": "https://registry.npmjs.org/ms/-/ms-2.0.0.tgz",
+      "integrity": "sha512-Tpp60P6IUJDTuOq/5Z8cdskzJujfwqfOTkrwIwj7IRISpnkJnT6SyJ4PCPnGMoFjC9ddhal5KVIYtAt97ix05A==",
+      "license": "MIT"
+    },
+    "node_modules/serve-static": {
+      "version": "1.16.3",
+      "resolved": "https://registry.npmjs.org/serve-static/-/serve-static-1.16.3.tgz",
+      "integrity": "sha512-x0RTqQel6g5SY7Lg6ZreMmsOzncHFU7nhnRWkKgWuMTu5NN0DR5oruckMqRvacAN9d5w6ARnRBXl9xhDCgfMeA==",
+      "license": "MIT",
+      "dependencies": {
+        "encodeurl": "~2.0.0",
+        "escape-html": "~1.0.3",
+        "parseurl": "~1.3.3",
+        "send": "~0.19.1"
+      },
+      "engines": {
+        "node": ">= 0.8.0"
+      }
+    },
+    "node_modules/setprototypeof": {
+      "version": "1.2.0",
+      "resolved": "https://registry.npmjs.org/setprototypeof/-/setprototypeof-1.2.0.tgz",
+      "integrity": "sha512-E5LDX7Wrp85Kil5bhZv46j8jOeboKq5JMmYM3gVGdGH8xFpPWXUMsNrlODCrkoxMEeNi/XZIwuRvY4XNwYMJpw==",
+      "license": "ISC"
+    },
     "node_modules/shebang-command": {
       "version": "2.0.0",
       "resolved": "https://registry.npmjs.org/shebang-command/-/shebang-command-2.0.0.tgz",
       "integrity": "sha512-kHxr2zZpYtdmrN1qDjrrX/Z1rR1kG8Dx+gkpK1G4eXmvXswmcE1hTWBWYUzlraYw1/yZp6YuDY77YtvbN0dmDA==",
       "dev": true,
       "license": "MIT",
       "dependencies": {
         "shebang-regex": "^3.0.0"
       },
       "engines": {
@@ -2392,30 +3263,120 @@
     "node_modules/shebang-regex": {
       "version": "3.0.0",
       "resolved": "https://registry.npmjs.org/shebang-regex/-/shebang-regex-3.0.0.tgz",
       "integrity": "sha512-7++dFhtcx3353uBaq8DDR4NuxBetBzC7ZQOhmTQInHEd6bSrXdiEyzCvG07Z44UYdLShWUyXt5M/yhz8ekcb1A==",
       "dev": true,
       "license": "MIT",
       "engines": {
         "node": ">=8"
       }
     },
+    "node_modules/side-channel": {
+      "version": "1.1.1",
+      "resolved": "https://registry.npmjs.org/side-channel/-/side-channel-1.1.1.tgz",
+      "integrity": "sha512-6x6dK6zJdpTzF4sQeNYxwtvBzf6Eg4GtlesS94HOvTudUeyK2WXAaIfmDgsyslYrRBeFIlsi54AYsFGUuhmvrQ==",
+      "license": "MIT",
+      "dependencies": {
+        "es-errors": "^1.3.0",
+        "object-inspect": "^1.13.4",
+        "side-channel-list": "^1.0.1",
+        "side-channel-map": "^1.0.1",
+        "side-channel-weakmap": "^1.0.2"
+      },
+      "engines": {
+        "node": ">= 0.4"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/ljharb"
+      }
+    },
+    "node_modules/side-channel-list": {
+      "version": "1.0.1",
+      "resolved": "https://registry.npmjs.org/side-channel-list/-/side-channel-list-1.0.1.tgz",
+      "integrity": "sha512-mjn/0bi/oUURjc5Xl7IaWi/OJJJumuoJFQJfDDyO46+hBWsfaVM65TBHq2eoZBhzl9EchxOijpkbRC8SVBQU0w==",
+      "license": "MIT",
+      "dependencies": {
+        "es-errors": "^1.3.0",
+        "object-inspect": "^1.13.4"
+      },
+      "engines": {
+        "node": ">= 0.4"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/ljharb"
+      }
+    },
+    "node_modules/side-channel-map": {
+      "version": "1.0.1",
+      "resolved": "https://registry.npmjs.org/side-channel-map/-/side-channel-map-1.0.1.tgz",
+      "integrity": "sha512-VCjCNfgMsby3tTdo02nbjtM/ewra6jPHmpThenkTYh8pG9ucZ/1P8So4u4FGBek/BjpOVsDCMoLA/iuBKIFXRA==",
+      "license": "MIT",
+      "dependencies": {
+        "call-bound": "^1.0.2",
+        "es-errors": "^1.3.0",
+        "get-intrinsic": "^1.2.5",
+        "object-inspect": "^1.13.3"
+      },
+      "engines": {
+        "node": ">= 0.4"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/ljharb"
+      }
+    },
+    "node_modules/side-channel-weakmap": {
+      "version": "1.0.2",
+      "resolved": "https://registry.npmjs.org/side-channel-weakmap/-/side-channel-weakmap-1.0.2.tgz",
+      "integrity": "sha512-WPS/HvHQTYnHisLo9McqBHOJk2FkHO/tlpvldyrnem4aeQp4hai3gythswg6p01oSoTl58rcpiFAjF2br2Ak2A==",
+      "license": "MIT",
+      "dependencies": {
+        "call-bound": "^1.0.2",
+        "es-errors": "^1.3.0",
+        "get-intrinsic": "^1.2.5",
+        "object-inspect": "^1.13.3",
+        "side-channel-map": "^1.0.1"
+      },
+      "engines": {
+        "node": ">= 0.4"
+      },
+      "funding": {
+        "url": "https://github.com/sponsors/ljharb"
+      }
+    },
     "node_modules/source-map-js": {
       "version": "1.2.1",
       "resolved": "https://registry.npmjs.org/source-map-js/-/source-map-js-1.2.1.tgz",
       "integrity": "sha512-UXWMKhLOwVKb728IUtQPXxfYU+usdybtUrK/8uGE8CQMvrhOpwvzDBwj0QhSL7MQc7vIsISBG8VQ8+IDQxpfQA==",
       "dev": true,
       "license": "BSD-3-Clause",
       "engines": {
         "node": ">=0.10.0"
       }
     },
+    "node_modules/split2": {
+      "version": "4.2.0",
+      "resolved": "https://registry.npmjs.org/split2/-/split2-4.2.0.tgz",
+      "integrity": "sha512-UcjcJOWknrNkF6PLX83qcHM6KHgVKNkV62Y8a5uYDVv9ydGQVwAHMKqHdJje1VTWpljG0WYpCDhrCdAOYH4TWg==",
+      "license": "ISC",
+      "engines": {
+        "node": ">= 10.x"
+      }
+    },
+    "node_modules/statuses": {
+      "version": "2.0.2",
+      "resolved": "https://registry.npmjs.org/statuses/-/statuses-2.0.2.tgz",
+      "integrity": "sha512-DvEy55V3DB7uknRo+4iOGT5fP1slR8wQohVdknigZPMpMstaKJQWhwiYBACJE3Ul2pTnATihhBYnRhZQHGBiRw==",
+      "license": "MIT",
+      "engines": {
+        "node": ">= 0.8"
+      }
+    },
     "node_modules/strip-json-comments": {
       "version": "3.1.1",
       "resolved": "https://registry.npmjs.org/strip-json-comments/-/strip-json-comments-3.1.1.tgz",
       "integrity": "sha512-6fPc+R4ihwqP6N/aIv2f1gMH8lOVtWQHoqC4yK6oSDVVocumAsfCqjkXnqiYMhmMwS/mEHLp7Vehlt3ql6lEig==",
       "dev": true,
       "license": "MIT",
       "engines": {
         "node": ">=8"
       },
       "funding": {
@@ -2445,20 +3406,29 @@
         "fdir": "^6.5.0",
         "picomatch": "^4.0.4"
       },
       "engines": {
         "node": ">=12.0.0"
       },
       "funding": {
         "url": "https://github.com/sponsors/SuperchupuDev"
       }
     },
+    "node_modules/toidentifier": {
+      "version": "1.0.1",
+      "resolved": "https://registry.npmjs.org/toidentifier/-/toidentifier-1.0.1.tgz",
+      "integrity": "sha512-o5sSPKEkg/DIQNmH43V0/uerLrpzVedkUh8tGNvaeXpfpuwjKenlSox/2O/BTlZUtEe+JG7s5YhEz608PlAHRA==",
+      "license": "MIT",
+      "engines": {
+        "node": ">=0.6"
+      }
+    },
     "node_modules/tslib": {
       "version": "2.8.1",
       "resolved": "https://registry.npmjs.org/tslib/-/tslib-2.8.1.tgz",
       "integrity": "sha512-oJFu94HQb+KVduSUQL7wnpmqnfmLsOA/nAh6b6EH0wCEoK0/mPeXU6c3wKDV83MkOuHPRHtSXKKU99IBazS/2w==",
       "dev": true,
       "license": "0BSD",
       "optional": true
     },
     "node_modules/type-check": {
       "version": "0.4.0",
@@ -2466,20 +3436,42 @@
       "integrity": "sha512-XleUoc9uwGXqjWwXaUTZAmzMcFZ5858QA2vvx1Ur5xIcixXIP+8LnFDgRplU30us6teqdlskFfu+ae4K79Ooew==",
       "dev": true,
       "license": "MIT",
       "dependencies": {
         "prelude-ls": "^1.2.1"
       },
       "engines": {
         "node": ">= 0.8.0"
       }
     },
+    "node_modules/type-is": {
+      "version": "1.6.18",
+      "resolved": "https://registry.npmjs.org/type-is/-/type-is-1.6.18.tgz",
+      "integrity": "sha512-TkRKr9sUTxEH8MdfuCSP7VizJyzRNMjj2J2do2Jr3Kym598JVdEksuzPQCnlFPW4ky9Q+iA+ma9BGm06XQBy8g==",
+      "license": "MIT",
+      "dependencies": {
+        "media-typer": "0.3.0",
+        "mime-types": "~2.1.24"
+      },
+      "engines": {
+        "node": ">= 0.6"
+      }
+    },
+    "node_modules/unpipe": {
+      "version": "1.0.0",
+      "resolved": "https://registry.npmjs.org/unpipe/-/unpipe-1.0.0.tgz",
+      "integrity": "sha512-pjy2bYhSsufwWlKwPc+l3cN7+wuJlK6uz0YdJEOlQDbl6jo/YlPi4mb8agUkVC8BF7V8NuzeyPNqRksA3hztKQ==",
+      "license": "MIT",
+      "engines": {
+        "node": ">= 0.8"
+      }
+    },
     "node_modules/update-browserslist-db": {
       "version": "1.2.3",
       "resolved": "https://registry.npmjs.org/update-browserslist-db/-/update-browserslist-db-1.2.3.tgz",
       "integrity": "sha512-Js0m9cx+qOgDxo0eMiFGEueWztz+d4+M3rGlmKPT+T4IS/jP4ylw3Nwpu6cpTTP8R1MAC1kF4VbdLt3ARf209w==",
       "dev": true,
       "funding": [
         {
           "type": "opencollective",
           "url": "https://opencollective.com/browserslist"
         },
@@ -2507,20 +3499,38 @@
     "node_modules/uri-js": {
       "version": "4.4.1",
       "resolved": "https://registry.npmjs.org/uri-js/-/uri-js-4.4.1.tgz",
       "integrity": "sha512-7rKUyy33Q1yc98pQ1DAmLtwX109F7TIfWlW1Ydo8Wl1ii1SeHieeh0HHfPeL2fMXK6z0s8ecKs9frCuLJvndBg==",
       "dev": true,
       "license": "BSD-2-Clause",
       "dependencies": {
         "punycode": "^2.1.0"
       }
     },
+    "node_modules/utils-merge": {
+      "version": "1.0.1",
+      "resolved": "https://registry.npmjs.org/utils-merge/-/utils-merge-1.0.1.tgz",
+      "integrity": "sha512-pMZTvIkT1d+TFGvDOqodOclx0QWkkgi6Tdoa8gC8ffGAAqz9pzPTZWAybbsHHoED/ztMtkv/VoYTYyShUn81hA==",
+      "license": "MIT",
+      "engines": {
+        "node": ">= 0.4.0"
+      }
+    },
+    "node_modules/vary": {
+      "version": "1.1.2",
+      "resolved": "https://registry.npmjs.org/vary/-/vary-1.1.2.tgz",
+      "integrity": "sha512-BNGbWLfd0eUPabhkXUVm0j8uuvREyTh5ovRa/dyow/BqAbZJyC+5fU+IzQOzmAKzYqYRAISoRhdQr3eIZ/PXqg==",
+      "license": "MIT",
+      "engines": {
+        "node": ">= 0.8"
+      }
+    },
     "node_modules/vite": {
       "version": "8.0.8",
       "resolved": "https://registry.npmjs.org/vite/-/vite-8.0.8.tgz",
       "integrity": "sha512-dbU7/iLVa8KZALJyLOBOQ88nOXtNG8vxKuOT4I2mD+Ya70KPceF4IAmDsmU0h1Qsn5bPrvsY9HJstCRh3hG6Uw==",
       "dev": true,
       "license": "MIT",
       "dependencies": {
         "lightningcss": "^1.32.0",
         "picomatch": "^4.0.4",
         "postcss": "^8.5.8",
@@ -2611,20 +3621,29 @@
     "node_modules/word-wrap": {
       "version": "1.2.5",
       "resolved": "https://registry.npmjs.org/word-wrap/-/word-wrap-1.2.5.tgz",
       "integrity": "sha512-BN22B5eaMMI9UMtjrGd5g5eCYPpCPDUy0FJXbYsaT5zYxjFOckS53SQDE3pWkVoWpHXVb3BrYcEN4Twa55B5cA==",
       "dev": true,
       "license": "MIT",
       "engines": {
         "node": ">=0.10.0"
       }
     },
+    "node_modules/xtend": {
+      "version": "4.0.2",
+      "resolved": "https://registry.npmjs.org/xtend/-/xtend-4.0.2.tgz",
+      "integrity": "sha512-LKYU1iAXJXUgAXn9URjiu+MWhyUXHsvfp7mcuYm9dSUKK0/CjtrUwFAxD82/mCWbtLsGjFIad0wIsod4zrTAEQ==",
+      "license": "MIT",
+      "engines": {
+        "node": ">=0.4"
+      }
+    },
     "node_modules/yallist": {
       "version": "3.1.1",
       "resolved": "https://registry.npmjs.org/yallist/-/yallist-3.1.1.tgz",
       "integrity": "sha512-a4UGQaWPH59mOXUYnAG2ewncQS4i4F43Tv3JoAM+s2VDAmS9NsK8GpDMLrCHPksFT7h3K6TOoUNn2pb7RoXx4g==",
       "dev": true,
       "license": "ISC"
     },
     "node_modules/yocto-queue": {
       "version": "0.1.0",
       "resolved": "https://registry.npmjs.org/yocto-queue/-/yocto-queue-0.1.0.tgz",
diff --git a/package.json b/package.json
index 862bf07..987c22d 100644
--- a/package.json
+++ b/package.json
@@ -1,23 +1,28 @@
 {
   "name": "absensi-app",
   "private": true,
   "version": "0.0.0",
   "type": "module",
   "scripts": {
     "dev": "vite",
     "build": "vite build",
     "lint": "eslint .",
-    "preview": "vite preview"
+    "preview": "vite preview",
+    "start": "node server/index.js",
+    "test": "node --test"
   },
   "dependencies": {
     "@vladmandic/human": "^3.3.6",
+    "dotenv": "^18.0.5",
+    "express": "^4.22.3",
+    "pg": "^8.23.1",
     "react": "^19.2.4",
     "react-dom": "^19.2.4"
   },
   "devDependencies": {
     "@eslint/js": "^9.39.4",
     "@types/react": "^19.2.14",
     "@types/react-dom": "^19.2.3",
     "@vitejs/plugin-react": "^6.0.1",
     "docxtemplater": "^3.71.0",
     "eslint": "^9.39.4",
diff --git a/server/auth.js b/server/auth.js
new file mode 100644
index 0000000..7a401bd
--- /dev/null
+++ b/server/auth.js
@@ -0,0 +1,16 @@
+export function parseToken(token) {
+  if (typeof token !== 'string') return null;
+  const parts = token.split('_');
+  if (parts.length < 3 || parts[0] !== 'usr') return null;
+  const id = Number(parts[1]);
+  return Number.isSafeInteger(id) && id > 0 ? id : null;
+}
+
+// Header tanpa skema ("usr_1_2") juga diterima; skema selain "bearer" ditolak.
+export function bearerToken(req) {
+  const raw = (req.headers?.authorization || '').trim();
+  if (!raw) return null;
+  const sp = raw.indexOf(' ');
+  if (sp === -1) return raw;
+  return raw.slice(0, sp).toLowerCase() === 'bearer' && raw.slice(sp + 1).trim() ? raw.slice(sp + 1).trim() : null;
+}
\ No newline at end of file
diff --git a/server/db.js b/server/db.js
new file mode 100644
index 0000000..bcc7248
--- /dev/null
+++ b/server/db.js
@@ -0,0 +1,29 @@
+import pg from 'pg';
+
+const { Pool } = pg;
+
+let pool = null;
+
+export function getPool() {
+  if (!pool) {
+    pool = new Pool({
+      connectionString: process.env.DATABASE_URL,
+      ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : undefined,
+      max: 5,
+    });
+    pool.on('error', (e) => console.error('[db] idle client error', e.message));
+  }
+  return pool;
+}
+
+export function query(text, params) {
+  return getPool().query(text, params);
+}
+
+export async function closePool() {
+  if (pool) {
+    const p = pool;
+    pool = null;
+    await p.end();
+  }
+}
\ No newline at end of file
diff --git a/server/index.js b/server/index.js
new file mode 100644
index 0000000..3dae83a
--- /dev/null
+++ b/server/index.js
@@ -0,0 +1,25 @@
+import express from 'express';
+import { closePool } from './db.js';
+
+export function createApp() {
+  const app = express();
+  app.use(express.json({ limit: '8mb' }));
+
+  app.get('/api/health', (_req, res) => {
+    res.json({ ok: true, service: 'absensi-media' });
+  });
+
+  return app;
+}
+
+const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
+if (isMain) {
+  const port = Number(process.env.PORT || 8081);
+  createApp().listen(port, () => console.log(`[media] listening on :${port}`));
+  for (const sig of ['SIGINT', 'SIGTERM']) {
+    process.on(sig, async () => {
+      await closePool();
+      process.exit(0);
+    });
+  }
+}
\ No newline at end of file
diff --git a/server/media.test.js b/server/media.test.js
new file mode 100644
index 0000000..e9e1dd1
--- /dev/null
+++ b/server/media.test.js
@@ -0,0 +1,24 @@
+import test from 'node:test';
+import assert from 'node:assert/strict';
+import { parseToken, bearerToken } from './auth.js';
+
+test('parseToken membaca user id dari token sesi', () => {
+  assert.equal(parseToken('usr_1383864355_1750000000000'), 1383864355);
+});
+
+test('parseToken menolak bentuk token lain', () => {
+  for (const bad of ['', 'abc', 'usr_', 'usr_abc_123', 'usr_12', null, undefined, 12345]) {
+    assert.equal(parseToken(bad), null, `harus menolak: ${String(bad)}`);
+  }
+});
+
+test('parseToken menolak prefix yang bukan usr', () => {
+  assert.equal(parseToken('admin_1383864355_1750000000000'), null);
+});
+
+test('bearerToken membaca header Authorization', () => {
+  assert.equal(bearerToken({ headers: { authorization: 'Bearer usr_1_2' } }), 'usr_1_2');
+  assert.equal(bearerToken({ headers: { authorization: 'usr_1_2' } }), 'usr_1_2');
+  assert.equal(bearerToken({ headers: {} }), null);
+  assert.equal(bearerToken({ headers: { authorization: 'Basic abc' } }), null);
+});
\ No newline at end of file

