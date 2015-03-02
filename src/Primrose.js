/* 
 * Copyright (C) 2015 Sean T. McBeth <sean@seanmcbeth.com>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 * along with self program.  If not, see <http://www.gnu.org/licenses/>.
 */

function Primrose(canvasID, options) {
    "use strict";
    var self = this;
    //////////////////////////////////////////////////////////////////////////
    // normalize input parameters
    //////////////////////////////////////////////////////////////////////////

    options = options || {};


    //////////////////////////////////////////////////////////////////////////
    // private fields
    //////////////////////////////////////////////////////////////////////////

    var codePage,
            operatingSystem,
            browser,
            commandSystem,
            keyboardSystem,
            commandPack = {},
            tokenizer,
            tokens,
            theme,
            pageSize,
            gridWidth, gridHeight,
            pointerX, pointerY,
            tabWidth, tabString,
            currentTouchID,
            texture, pickingTexture, pickingPixelBuffer,
            deadKeyState = "",
            keyNames = [],
            history = [],
            historyFrame = -1,
            dragging = false,
            focused = false,
            changed = false,
            showLineNumbers = true,
            showScrollBars = true,
            wordWrap = false,
            canvas = cascadeElement(canvasID, "canvas", HTMLCanvasElement),
            gfx = canvas.getContext("2d"),
            surrogate = cascadeElement("primrose-surrogate-textarea-" + canvas.id, "textarea", HTMLTextAreaElement),
            surrogateContainer;


    //////////////////////////////////////////////////////////////////////////
    // public fields
    //////////////////////////////////////////////////////////////////////////

    this.frontCursor = new Cursor();
    this.backCursor = new Cursor();
    this.scrollTop = 0;
    this.scrollLeft = 0;
    this.gridLeft = 0;
    this.gridTop = 0;
    this.lineCount = 0;
    this.currentToken = null;


    //////////////////////////////////////////////////////////////////////////
    // private methods
    //////////////////////////////////////////////////////////////////////////
    
    function clampScroll(){
        if (self.scrollTop < 0) {
            self.scrollTop = 0;
        }
        else while(self.scrollTop > self.lineCount - gridHeight){
            --self.scrollTop;
        }        
    }

    function minDelta(v, minV, maxV) {
        var dvMinV = v - minV;
        var dvMaxV = v - maxV + 5;
        var dv = 0;
        if (!(dvMinV >= 0 && dvMaxV < 0)) {
            // compare the absolute values, so we get the smallest change regardless
            // of direction
            if (Math.abs(dvMinV) < Math.abs(dvMaxV)) {
                dv = dvMinV;
            }
            else {
                dv = dvMaxV;
            }
        }

        return dv;
    }

    function readClipboard(evt) {
        var i = evt.clipboardData.types.indexOf("text/plain");
        if (i < 0) {
            for (i = 0; i < evt.clipboardData.types.length; ++i) {
                if (/^text/.test(evt.clipboardData.types[i])) {
                    break;
                }
            }
        }
        if (i >= 0) {
            var type = evt.clipboardData.types[i];
            var str = evt.clipboardData.getData(type);
            evt.preventDefault();
            self.pasteAtCursor(str);
        }
    }

    function measureText() {
        var r = self.getPixelRatio(),
                oldCharacterWidth = self.characterWidth,
                oldCharacterHeight = self.characterHeight,
                oldWidth = canvas.width,
                oldHeight = canvas.height,
                oldFont = gfx.font;

        self.characterHeight = theme.fontSize * r;
        canvas.width = canvas.clientWidth * r;
        canvas.height = canvas.clientHeight * r;
        gfx.font = self.characterHeight + "px " + theme.fontFamily;
        // measure 100 letter M's, then divide by 100, to get the width of an M
        // to two decimal places on systems that return integer values from
        // measureText.
        self.characterWidth = gfx.measureText("MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM").width / 100;
        changed = oldCharacterWidth !== self.characterWidth ||
                oldCharacterHeight !== self.characterHeight ||
                oldWidth !== canvas.width ||
                oldHeight !== canvas.height ||
                oldFont !== gfx.font;
        self.drawText();
    }

    function setCursorXY(cursor, x, y) {
        changed = true;
        pointerX = x;
        pointerY = y;
        var lines = self.getLines();
        var cell = self.pixel2cell(x, y);
        cursor.setXY(cell.x, cell.y, lines);
    }

    function mouseButtonDown(pointerEventSource, evt) {
        if (focused && evt.button === 0) {
            var bounds = pointerEventSource.getBoundingClientRect();
            self.startPointer(evt.clientX - bounds.left, evt.clientY - bounds.top);
            evt.preventDefault();
        }
    }

    function mouseMove(pointerEventSource, evt) {
        if (focused) {
            var bounds = pointerEventSource.getBoundingClientRect();
            self.movePointer(evt.clientX - bounds.left, evt.clientY - bounds.top);
        }
    }

    function mouseButtonUp(evt) {
        if (focused && evt.button === 0) {
            self.endPointer();
        }
    }

    function touchStart(pointerEventSource, evt) {
        if (focused && evt.touches.length > 0 && !dragging) {
            var t = evt.touches[0];
            var bounds = pointerEventSource.getBoundingClientRect();
            self.startPointer(t.clientX - bounds.left, t.clientY - bounds.top);
            currentTouchID = t.identifier;
        }
    }

    function touchMove(pointerEventSource, evt) {
        for (var i = 0; i < evt.changedTouches.length && dragging; ++i) {
            var t = evt.changedTouches[i];
            if (t.identifier === currentTouchID) {
                var bounds = pointerEventSource.getBoundingClientRect();
                self.movePointer(t.clientX - bounds.left, t.clientY - bounds.top);
                break;
            }
        }
    }

    function touchEnd(evt) {
        for (var i = 0; i < evt.changedTouches.length && dragging; ++i) {
            var t = evt.changedTouches[i];
            if (t.identifier === currentTouchID) {
                self.endPointer();
            }
        }
    }

    function addCommandPack(cmd) {
        if (cmd) {
            for (var key in cmd) {
                if (cmd.hasOwnProperty(key)) {
                    var func = cmd[key];
                    if (!(func instanceof Function)) {
                        func = self.insertAtCursor.bind(self, func);
                    }
                    commandPack[key] = func;
                }
            }
        }
    }

    function refreshCommandPack() {
        if (keyboardSystem && operatingSystem && commandSystem) {
            commandPack = {};
        }
        addCommandPack.call(self, keyboardSystem);
        addCommandPack.call(self, operatingSystem);
        addCommandPack.call(self, browser);
        addCommandPack.call(self, commandSystem);
    }

    function makeCursorCommand(name) {
        var method = name.toLowerCase();
        self["cursor" + name] = function (lines, cursor) {
            changed = true;
            cursor[method](lines);
            self.scrollIntoView(cursor);
        };
    }

    function getPixelIndex(gl, x, y) {
        if (!pickingPixelBuffer) {
            pickingPixelBuffer = new Uint8Array(4);
        }

        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pickingPixelBuffer);

        var i = (pickingPixelBuffer[0] << 16) |
                (pickingPixelBuffer[1] << 8) |
                (pickingPixelBuffer[2] << 0);
        return i;
    }


    //////////////////////////////////////////////////////////////////////////
    // public methods
    //////////////////////////////////////////////////////////////////////////
    ["Left", "Right",
        "SkipLeft", "SkipRight",
        "Up", "Down",
        "Home", "End",
        "FullHome", "FullEnd"].map(makeCursorCommand.bind(self));

    this.cursorPageUp = function (lines, cursor) {
        changed = true;
        cursor.incY(-pageSize, lines);
        this.scrollIntoView(cursor);
    };

    this.cursorPageDown = function (lines, cursor) {
        changed = true;
        cursor.incY(pageSize, lines);
        this.scrollIntoView(cursor);
    };

    this.focus = function () {
        focused = true;
        this.forceUpdate();
    };

    this.blur = function () {
        focused = false;
        this.forceUpdate();
    };

    this.isFocused = function () {
        return focused;
    };

    this.getCanvas = function () {
        return canvas;
    };

    this.getTexture = function (anisotropy) {
        if (window.THREE && !texture) {
            texture = new THREE.Texture(canvas);
            texture.anisotropy = anisotropy || 8;
            texture.needsUpdate = true;
        }
        return texture;
    };

    this.getPickingTexture = function () {
        if (!pickingTexture) {
            var c = document.createElement("canvas"),
                    w = this.getWidth(),
                    h = this.getHeight();
            c.width = w;
            c.height = h;

            var gfx = c.getContext("2d"),
                    pixels = gfx.createImageData(w, h);

            for (var i = 0, p = 0, l = w * h; i < l; ++i, p += 4) {
                pixels.data[p] = (0xff0000 & i) >> 16;
                pixels.data[p + 1] = (0x00ff00 & i) >> 8;
                pixels.data[p + 2] = (0x0000ff & i) >> 0;
                pixels.data[p + 3] = 0xff;
            }
            gfx.putImageData(pixels, 0, 0);
            pickingTexture = new THREE.Texture(c, THREE.UVMapping, THREE.RepeatWrapping, THREE.RepeatWrapping, THREE.NearestFilter, THREE.NearestMipMapNearestFilter, THREE.RGBAFormat, THREE.UnsignedByteType, 0);
            pickingTexture.needsUpdate = true;
        }
        return pickingTexture;
    };

    this.startPicking = function (gl, x, y) {
        var i = getPixelIndex(gl, x, y);
        x = i % canvas.width;
        y = i / canvas.width;

        this.startPointer(x, y);
    };

    this.movePicking = function (gl, x, y) {
        var i = getPixelIndex(gl, x, y);
        x = i % canvas.width;
        y = i / canvas.width;

        this.movePointer(x, y);
    };

    this.setWordWrap = function (v) {
        wordWrap = v;
        this.forceUpdate();
    };

    this.getWordWrap = function () {
        return wordWrap;
    };

    this.setShowLineNumbers = function (v) {
        showLineNumbers = v;
        this.forceUpdate();
    };

    this.getShowLineNumbers = function () {
        return showLineNumbers;
    };

    this.setShowScrollBars = function (v) {
        showScrollBars = v;
        this.forceUpdate();
    };

    this.getShowScrollBars = function () {
        return showScrollBars;
    };

    this.setTheme = function (t) {
        theme = t || Themes.DEFAULT;
        measureText();
    };

    this.getTheme = function () {
        return theme;
    };

    this.setDeadKeyState = function (st) {
        changed = true;
        deadKeyState = st || "";
    };

    this.setOperatingSystem = function (os) {
        changed = true;
        operatingSystem = os || (isOSX ? OperatingSystems.OSX : OperatingSystems.WINDOWS);
        refreshCommandPack();
    };

    this.getOperatingSystem = function () {
        return operatingSystem;
    };

    this.setCommandSystem = function (cmd) {
        changed = true;
        commandSystem = cmd || Commands.DEFAULT;
        refreshCommandPack();
    };

    this.setSize = function (w, h) {
        canvas.style.width = w + "px";
        canvas.style.height = h + "px";
        measureText();
    };

    this.getWidth = function () {
        return canvas.width;
    };

    this.getHeight = function () {
        return canvas.height;
    };

    this.forceUpdate = function () {
        changed = true;
        this.drawText();
    };

    this.setCodePage = function (cp) {
        changed = true;
        var key, code;
        var lang = (navigator.languages && navigator.languages[0]) ||
                navigator.language ||
                navigator.userLanguage ||
                navigator.browserLanguage;

        if (!lang || lang === "en") {
            lang = "en-US";
        }

        codePage = cp;

        if (!codePage) {
            for (key in CodePages) {
                cp = CodePages[key];
                if (cp.language === lang) {
                    codePage = cp;
                    break;
                }
            }

            if (!codePage) {
                codePage = CodePages.EN_US;
            }
        }

        keyNames = [];
        for (key in Keys) {
            code = Keys[key];
            if (!isNaN(code)) {
                keyNames[code] = key;
            }
        }

        keyboardSystem = {};
        for (var type in codePage) {
            var codes = codePage[type];
            if (typeof (codes) === "object") {
                for (code in codes) {
                    var char, name;
                    if (code.indexOf("_") > -1) {
                        var parts = code.split(' ');
                        var browser = parts[0];
                        code = parts[1];
                        char = codePage.NORMAL[code];
                        name = browser + "_" + type + " " + char;
                    }
                    else {
                        char = codePage.NORMAL[code];
                        name = type + "_" + char;
                    }
                    keyNames[code] = char;
                    keyboardSystem[name] = codes[code];
                }
            }
        }

        refreshCommandPack();
    };

    this.getCodePage = function () {
        return codePage;
    };

    this.setTokenizer = function (tk) {
        changed = true;
        tokenizer = tk || Grammar.JavaScript;
        if (history && history.length > 0) {
            tokens = tokenizer.tokenize(this.getText());
            if (this.drawText) {
                this.drawText();
            }
        }
    };

    this.getTokenizer = function () {
        return tokenizer;
    };

    this.getLines = function () {
        return history[historyFrame].slice();
    };

    this.pushUndo = function (lines) {
        if (historyFrame < history.length - 1) {
            history.splice(historyFrame + 1);
        }
        history.push(lines);
        historyFrame = history.length - 1;
        tokens = tokenizer.tokenize(this.getText());
        this.forceUpdate();
    };

    this.redo = function () {
        changed = true;
        if (historyFrame < history.length - 1) {
            ++historyFrame;
        }
        tokens = tokenizer.tokenize(this.getText());
    };

    this.undo = function () {
        changed = true;
        if (historyFrame > 0) {
            --historyFrame;
        }
        tokens = tokenizer.tokenize(this.getText());
    };

    this.setTabWidth = function (tw) {
        tabWidth = tw || 4;
        tabString = "";
        for (var i = 0; i < tabWidth; ++i) {
            tabString += " ";
        }
    };

    this.getTabWidth = function () {
        return tabWidth;
    };

    this.getTabString = function () {
        return tabString;
    };

    this.scrollIntoView = function (currentCursor) {
        this.scrollTop += minDelta(currentCursor.y, this.scrollTop, this.scrollTop + gridHeight);
        this.scrollLeft += minDelta(currentCursor.x, this.scrollLeft, this.scrollLeft + gridWidth);
        clampScroll();
    };

    this.increaseFontSize = function () {
        ++theme.fontSize;
        measureText();
    };

    this.decreaseFontSize = function () {
        if (theme.fontSize > 1) {
            --theme.fontSize;
            measureText();
        }
    };

    this.getText = function () {
        return this.getLines().join("\n");
    };

    this.setText = function (txt) {
        txt = txt || "";
        txt = txt.replace(/\r\n/g, "\n");
        var lines = txt.split("\n");
        this.pushUndo(lines);
        if (this.drawText) {
            this.drawText();
        }
    };

    this.pixel2cell = function (x, y) {
        var r = this.getPixelRatio();
        x = Math.floor(x * r / this.characterWidth) + this.scrollLeft - this.gridLeft;
        y = Math.floor((y * r / this.characterHeight) - 0.25) + this.scrollTop;
        return {x: x, y: y};
    };

    this.cell2i = function (x, y) {
        var lines = this.getLines();
        var i = 0;
        for (var dy = 0; dy < y; ++dy) {
            i += lines[dy].length + 1;
        }
        i += x;
        return i;
    };

    this.i2cell = function (i) {
        var lines = this.getLines();
        for (var y = 0; y < lines.length; ++y) {
            if (i <= lines.length) {
                return {x: i, y: y};
            }
            else {
                i -= lines.length - 1;
            }
        }
    };

    this.getPixelRatio = function () {
        return window.devicePixelRatio || 1;
    };

    this.deleteSelection = function () {
        if (this.frontCursor.i !== this.backCursor.i) {
            var minCursor = Cursor.min(this.frontCursor, this.backCursor);
            var maxCursor = Cursor.max(this.frontCursor, this.backCursor);
            var lines = this.getLines();
            // TODO: don't rejoin the string first.
            var text = lines.join("\n");
            var left = text.substring(0, minCursor.i);
            var right = text.substring(maxCursor.i);
            text = left + right;
            maxCursor.copy(minCursor);
            this.setText(text);
        }
    };

    this.insertAtCursor = function (str) {
        if (str.length > 0) {
            str = str.replace(/\r\n/g, "\n");
            this.deleteSelection();
            var lines = this.getLines();
            var parts = str.split("\n");
            parts[0] = lines[this.frontCursor.y].substring(0, this.frontCursor.x) + parts[0];
            parts[parts.length - 1] += lines[this.frontCursor.y].substring(this.frontCursor.x);
            lines.splice.bind(lines, this.frontCursor.y, 1).apply(lines, parts);
            for (var i = 0; i < str.length; ++i) {
                this.frontCursor.right(lines);
            }
            this.backCursor.copy(this.frontCursor);
            this.scrollIntoView(this.frontCursor);
            this.pushUndo(lines);
        }
    };

    this.pasteAtCursor = function (str) {
        this.insertAtCursor(str);
        this.drawText();
    };

    this.copySelectedText = function (evt) {
        if (this.frontCursor.i !== this.backCursor.i) {
            var minCursor = Cursor.min(this.frontCursor, this.backCursor);
            var maxCursor = Cursor.max(this.frontCursor, this.backCursor);
            var lines = this.getLines();
            var text = lines.join("\n");
            var str = text.substring(minCursor.i, maxCursor.i);
            evt.clipboardData.setData("text/plain", str);
        }
        evt.preventDefault();
    };

    this.cutSelectedText = function (evt) {
        this.copySelectedText(evt);
        this.deleteSelection();
        this.drawText();
    };

    this.placeSurrogateUnder = function (elem) {
        if (surrogate && elem) {
            // wait a brief amount of time to make sure the browser rendering 
            // engine had time to catch up
            setTimeout(function () {
                var bounds = elem.getBoundingClientRect();
                surrogate.style.left = bounds.left + "px";
                surrogate.style.top = window.scrollY + bounds.top + "px";
                surrogate.style.width = (bounds.right - bounds.left) + "px";
                surrogate.style.height = (bounds.bottom - bounds.top) + "px";
            }, 250);
        }
    };

    this.incCurrentToken = function (dir) {
        if (this.currentToken && this.currentToken.type === "numbers") {
            var num = parseFloat(this.currentToken.value);
            var increment = Math.pow(10, Math.floor(Math.log10(Math.abs(num))));
            if (increment >= 1) {
                increment /= 10;
            }
            else if (!increment) {
                increment = 0.1;
            }
            num += dir * increment;
            var text = this.getText();
            var left = text.substring(0, this.currentToken.index);
            var right = text.substring(this.currentToken.index + this.currentToken.value.length);
            if (increment < 1) {
                var d = Math.ceil(-Math.log10(1.1 * increment));
                console.log(num, increment, d);
                console.log(num.toFixed(d));
                text = left + num.toFixed(d) + right;
            }
            else {
                text = left + num.toString() + right;
            }
            this.setText(text);
        }
    };

    this.editText = function (evt) {
        evt = evt || event;

        var key = evt.keyCode;
        if (key !== Keys.CTRL && key !== Keys.ALT && key !== Keys.META_L && key !== Keys.META_R && key !== Keys.SHIFT) {
            var oldDeadKeyState = deadKeyState;

            var commandName = deadKeyState;

            if (evt.ctrlKey) {
                commandName += "CTRL";
            }
            if (evt.altKey) {
                commandName += "ALT";
            }
            if (evt.metaKey) {
                commandName += "META";
            }
            if (evt.shiftKey) {
                commandName += "SHIFT";
            }
            if (commandName === deadKeyState) {
                commandName += "NORMAL";
            }

            commandName += "_" + keyNames[key];

            var func = commandPack[browser + "_" + commandName] || commandPack[commandName];
            if (func) {
                this.frontCursor.moved = false;
                this.backCursor.moved = false;
                var lines = this.getLines();
                func.call(null, self, lines);
                lines = this.getLines();
                if (this.frontCursor.moved && !this.backCursor.moved) {
                    this.backCursor.copy(this.frontCursor);
                }
                this.frontCursor.rectify(lines);
                this.backCursor.rectify(lines);
                evt.preventDefault();
            }

            if (deadKeyState === oldDeadKeyState) {
                deadKeyState = "";
            }
        }
        this.drawText();
    };

    function fillRect(gfx, fill, x, y, w, h) {
        gfx.fillStyle = fill;
        gfx.fillRect(
                x * self.characterWidth,
                y * self.characterHeight,
                w * self.characterWidth + 1,
                h * self.characterHeight + 1);
    }

    this.drawText = function () {
        if (changed && theme && tokens) {
            var t, i;
            var clearFunc = theme.regular.backColor ? "fillRect" : "clearRect";
            if (theme.regular.backColor) {
                gfx.fillStyle = theme.regular.backColor;
            }
            gfx[clearFunc](0, 0, gfx.canvas.width, gfx.canvas.height);

            this.lineCount = 1;

            for (i = 0; i < tokens.length; ++i) {
                if (tokens[i].type === "newlines") {
                    ++this.lineCount;
                }
            }

            var lineCountWidth = 0;
            var leftGutterWidth = 0;
            var rightGutterWidth = 0;
            var bottomGutterHeight = 0;

            if (showLineNumbers) {
                lineCountWidth = Math.max(1, Math.ceil(Math.log(this.lineCount) / Math.LN10));
                leftGutterWidth = 1;
            }

            if (showScrollBars) {
                rightGutterWidth = 1;
                bottomGutterHeight = 1;
            }

            this.gridLeft = leftGutterWidth + lineCountWidth;

            gridWidth = Math.floor(canvas.width / this.characterWidth) - this.gridLeft - rightGutterWidth;
            var scrollRight = this.scrollLeft + gridWidth;

            gridHeight = Math.floor(canvas.height / this.characterHeight) - bottomGutterHeight;
            pageSize = Math.floor(gridHeight);

            // group the tokens into rows
            var currentRow = [];
            var rows = [currentRow];
            var rowX = 0;
            for (i = 0; i < tokens.length; ++i) {
                t = tokens[i].clone();
                currentRow.push(t);
                rowX += t.value.length;
                if (wordWrap && rowX >= gridWidth || t.type === "newlines") {
                    currentRow = [];
                    rows.push(currentRow);
                    if (wordWrap && rowX >= gridWidth && t.type !== "newlines") {
                        currentRow.push(t.splitAt(gridWidth - (rowX - t.value.length)));
                    }
                    rowX = 0;
                }
            }

            var minCursor = Cursor.min(this.frontCursor, this.backCursor);
            var maxCursor = Cursor.max(this.frontCursor, this.backCursor);
            var tokenFront = new Cursor();
            var tokenBack = new Cursor();
            var maxLineWidth = 0;
            var lastLine = -1;

            this.currentToken = null;

            for (var y = 0; y < rows.length; ++y) {
                // draw the tokens on this row
                var row = rows[y];
                // be able to draw brand-new rows that don't have any tokens yet
                var currentLine = row.length > 0 ? row[0].line : lastLine + 1;
                // draw the left gutter
                if (showLineNumbers && this.scrollTop <= y && y < this.scrollTop + gridHeight) {
                    var lineNumber = currentLine.toString();
                    while (lineNumber.length < lineCountWidth) {
                        lineNumber = " " + lineNumber;
                    }
                    fillRect(gfx, theme.regular.selectedBackColor || Themes.DEFAULT.regular.selectedBackColor,
                            0, (y - this.scrollTop + 0.2),
                            (lineNumber.length + leftGutterWidth), 1);
                    gfx.font = "bold " + this.characterHeight + "px " + theme.fontFamily;

                    if (currentLine > lastLine) {
                        gfx.fillStyle = theme.regular.foreColor;
                        gfx.fillText(
                                lineNumber,
                                0,
                                (y - this.scrollTop + 1) * this.characterHeight);
                    }
                }
                lastLine = currentLine;

                // draw the current row highlighter
                if (focused && y === this.backCursor.y) {
                    fillRect(gfx, theme.regular.currentRowBackColor || Themes.DEFAULT.regular.currentRowBackColor,
                            (this.gridLeft - this.scrollLeft), (y + 0.2 - this.scrollTop),
                            gridWidth, 1);
                }

                for (i = 0; i < row.length; ++i) {
                    t = row[i];
                    tokenBack.x += t.value.length;
                    tokenBack.i += t.value.length;

                    if (t.type === "newlines") {
                        lastLine = currentLine;
                    }

                    // skip drawing tokens that aren't in view
                    if (this.scrollTop <= y && y < this.scrollTop + gridHeight &&
                            this.scrollLeft <= tokenBack.x && tokenFront.x < scrollRight) {
                        // draw the selection box
                        if (minCursor.i <= tokenBack.i && tokenFront.i < maxCursor.i) {
                            if (minCursor.i === maxCursor.i) {
                                this.currentToken = t;
                            }
                            var selectionFront = Cursor.max(minCursor, tokenFront);
                            var selectionBack = Cursor.min(maxCursor, tokenBack);
                            var cw = selectionBack.i - selectionFront.i;
                            fillRect(gfx, theme.regular.selectedBackColor || Themes.DEFAULT.regular.selectedBackColor,
                                    (selectionFront.x + this.gridLeft - this.scrollLeft), (selectionFront.y + 0.2 - this.scrollTop),
                                    cw, 1);
                        }

                        // draw the text
                        var style = theme[t.type] || {};
                        var font = (style.fontWeight || theme.regular.fontWeight || "") +
                                " " + (style.fontStyle || theme.regular.fontStyle || "") +
                                " " + this.characterHeight + "px " + theme.fontFamily;
                        gfx.font = font.trim();
                        gfx.fillStyle = style.foreColor || theme.regular.foreColor;
                        gfx.fillText(
                                t.value,
                                (tokenFront.x - this.scrollLeft + this.gridLeft) * this.characterWidth,
                                (tokenFront.y - this.scrollTop + 1) * this.characterHeight);
                    }

                    tokenFront.copy(tokenBack);
                }

                maxLineWidth = Math.max(maxLineWidth, tokenBack.x);
                tokenFront.x = 0;
                ++tokenFront.y;
                tokenBack.copy(tokenFront);
            }

            // draw the cursor caret
            if (focused) {
                gfx.beginPath();
                gfx.strokeStyle = theme.cursorColor || "black";
                gfx.moveTo(
                        (this.frontCursor.x - this.scrollLeft + this.gridLeft) * this.characterWidth,
                        (this.frontCursor.y - this.scrollTop) * this.characterHeight);
                gfx.lineTo(
                        (this.frontCursor.x - this.scrollLeft + this.gridLeft) * this.characterWidth,
                        (this.frontCursor.y - this.scrollTop + 1.25) * this.characterHeight);
                gfx.moveTo(
                        (this.backCursor.x - this.scrollLeft + this.gridLeft) * this.characterWidth + 1,
                        (this.backCursor.y - this.scrollTop) * this.characterHeight);
                gfx.lineTo(
                        (this.backCursor.x - this.scrollLeft + this.gridLeft) * this.characterWidth + 1,
                        (this.backCursor.y - this.scrollTop + 1.25) * this.characterHeight);
                gfx.stroke();
            }

            // draw the scrollbars
            if (showScrollBars) {
                var drawWidth = gridWidth * this.characterWidth;
                var drawHeight = gridHeight * this.characterHeight;
                var scrollX = (this.scrollLeft * drawWidth) / maxLineWidth + this.gridLeft * this.characterWidth;
                var scrollY = (this.scrollTop * drawHeight) / rows.length + this.gridTop * this.characterHeight;
                var scrollBarWidth = gridWidth * drawWidth / maxLineWidth - (this.gridLeft + rightGutterWidth) * this.characterWidth;
                var scrollBarHeight = gridHeight * drawHeight / rows.length - (this.gridTop + bottomGutterHeight) * this.characterHeight;
                
                gfx.fillStyle = theme.regular.selectedBackColor || Themes.DEFAULT.regular.selectedBackColor;
                // horizontal
                gfx.fillRect(
                        scrollX,
                        (gridHeight + 0.25) * this.characterHeight,
                        Math.max(this.characterWidth, scrollBarWidth),
                        this.characterHeight);
                        
                //vertical
                gfx.fillRect(
                        canvas.width - this.characterWidth,
                        scrollY,
                        this.characterWidth,
                        Math.max(this.characterHeight, scrollBarHeight));
            }

            if (texture) {
                texture.needsUpdate = true;
            }
            changed = false;
        }
    };

    this.readWheel = function (evt) {
        if (focused) {
            var delta = Math.floor(evt.deltaY / this.characterHeight);
            this.scrollTop += delta;
            clampScroll();
            evt.preventDefault();
            this.forceUpdate();
        }
    };

    this.startPointer = function (x, y) {
        setCursorXY.call(self, this.frontCursor, x, y);
        this.backCursor.copy(this.frontCursor);
        dragging = true;
        this.drawText();
    };

    this.movePointer = function (x, y) {
        if (dragging) {
            setCursorXY.call(self, this.backCursor, x, y);
            this.drawText();
        }
    };

    this.endPointer = function () {
        dragging = false;
        surrogate.focus();
    };

    this.bindEvents = function (keyEventSource, pointerEventSource) {
        if (keyEventSource) {
            keyEventSource.addEventListener("keydown", this.editText.bind(self));
        }

        if (pointerEventSource) {
            pointerEventSource.addEventListener("wheel", this.readWheel.bind(self));
            pointerEventSource.addEventListener("mousedown", mouseButtonDown.bind(self, pointerEventSource));
            pointerEventSource.addEventListener("mousemove", mouseMove.bind(self, pointerEventSource));
            pointerEventSource.addEventListener("mouseup", mouseButtonUp.bind(self));
            pointerEventSource.addEventListener("touchstart", touchStart.bind(self, pointerEventSource));
            pointerEventSource.addEventListener("touchmove", touchMove.bind(self, pointerEventSource));
            pointerEventSource.addEventListener("touchend", touchEnd.bind(self));
        }
    };


    //////////////////////////////////////////////////////////////////////////
    // initialization
    /////////////////////////////////////////////////////////////////////////
    browser = isChrome ? "CHROMIUM" : (isFirefox ? "FIREFOX" : (isIE ? "IE" : (isOpera ? "OPERA" : (isSafari ? "SAFARI" : "UNKNOWN"))));
    if (!(canvasID instanceof HTMLCanvasElement) && options.width && options.height) {
        canvas.style.position = "absolute";
        canvas.style.width = options.width;
        canvas.style.height = options.height;
    }

    // the `surrogate` textarea makes the soft-keyboard appear on mobile devices.
    surrogate.style.position = "absolute";
    surrogateContainer = makeHidingContainer("primrose-surrogate-textarea-container-" + canvas.id, surrogate);

    if (!canvas.parentElement) {
        document.body.appendChild(makeHidingContainer("primrose-container-" + canvas.id, canvas));
    }

    document.body.appendChild(surrogateContainer);

    this.setWordWrap(!!options.wordWrap);
    this.setShowLineNumbers(!options.hideLineNumbers);
    this.setShowScrollBars(!options.hideScrollBars);
    this.setTabWidth(options.tabWidth);
    this.setTheme(options.theme);
    this.setTokenizer(options.tokenizer);
    this.setCodePage(options.codePage);
    this.setOperatingSystem(options.os);
    this.setCommandSystem(options.commands);
    this.setText(options.file);
    this.bindEvents(options.keyEventSource, options.pointerEventSource);

    this.themeSelect = makeSelectorFromObj("primrose-theme-selector-" + canvas.id, Themes, theme.name, self, "setTheme", "theme");
    this.tokenizerSelect = makeSelectorFromObj("primrose-tokenizer-selector-" + canvas.id, Grammar, tokenizer.name, self, "setTokenizer", "language syntax");
    this.keyboardSelect = makeSelectorFromObj("primrose-keyboard-selector-" + canvas.id, CodePages, codePage.name, self, "setCodePage", "localization");
    this.commandSystemSelect = makeSelectorFromObj("primrose-command-system-selector-" + canvas.id, Commands, commandSystem.name, self, "setCommandSystem", "command system");
    this.operatingSystemSelect = makeSelectorFromObj("primrose-operating-system-selector-" + canvas.id, OperatingSystems, operatingSystem.name, self, "setOperatingSystem", "shortcut style");


    //////////////////////////////////////////////////////////////////////////
    // wire up event handlers
    //////////////////////////////////////////////////////////////////////////

    window.addEventListener("resize", measureText.bind(self));

    surrogate.addEventListener("copy", this.copySelectedText.bind(self));
    surrogate.addEventListener("cut", this.cutSelectedText.bind(self));
    surrogate.addEventListener("paste", readClipboard.bind(self));
}