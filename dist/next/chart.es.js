//#region \0@oxc-project+runtime@0.149.0/helpers/esm/typeof.js
function e(t) {
	"@babel/helpers - typeof";
	return e = typeof Symbol == "function" && typeof Symbol.iterator == "symbol" ? function(e) {
		return typeof e;
	} : function(e) {
		return e && typeof Symbol == "function" && e.constructor === Symbol && e !== Symbol.prototype ? "symbol" : typeof e;
	}, e(t);
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/toPrimitive.js
function t(t, n) {
	if (e(t) != "object" || !t) return t;
	var r = t[Symbol.toPrimitive];
	if (r !== void 0) {
		var i = r.call(t, n || "default");
		if (e(i) != "object") return i;
		throw TypeError("@@toPrimitive must return a primitive value.");
	}
	return (n === "string" ? String : Number)(t);
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/toPropertyKey.js
function n(n) {
	var r = t(n, "string");
	return e(r) == "symbol" ? r : r + "";
}
//#endregion
//#region \0@oxc-project+runtime@0.149.0/helpers/esm/defineProperty.js
function r(e, t, r) {
	return (t = n(t)) in e ? Object.defineProperty(e, t, {
		value: r,
		enumerable: !0,
		configurable: !0,
		writable: !0
	}) : e[t] = r, e;
}
//#endregion
//#region core/src/emitter.ts
var i = class {
	constructor() {
		r(this, "listeners", /* @__PURE__ */ new Map());
	}
	on(e, t) {
		let n = this.listeners.get(e);
		return n === void 0 && (n = /* @__PURE__ */ new Set(), this.listeners.set(e, n)), n.add(t), () => this.off(e, t);
	}
	off(e, t) {
		this.listeners.get(e)?.delete(t);
	}
	emit(e, t) {
		let n = this.listeners.get(e);
		if (n !== void 0) for (let e of n) e(t);
	}
	clear() {
		this.listeners.clear();
	}
}, a = .002;
function o(e, t) {
	let n = /* @__PURE__ */ new Map(), r = 0, i = (t) => {
		let n = e.getBoundingClientRect();
		return {
			x: t.clientX - n.left,
			y: t.clientY - n.top
		};
	}, o = (t) => {
		e.setPointerCapture(t.pointerId), n.set(t.pointerId, i(t)), n.size === 2 && (r = d());
	}, s = (e) => {
		let a = i(e), o = n.get(e.pointerId);
		if (o === void 0) {
			t.onCrosshairMove(a.x, a.y);
			return;
		}
		if (n.set(e.pointerId, a), n.size >= 2) {
			let e = d();
			r > 0 && e > 0 && t.onZoom(f(), e / r), r = e;
			return;
		}
		t.onPan(a.x - o.x, a.y - o.y), t.onCrosshairMove(a.x, a.y);
	}, c = (t) => {
		n.delete(t.pointerId), r = n.size === 2 ? d() : 0, e.hasPointerCapture(t.pointerId) && e.releasePointerCapture(t.pointerId);
	}, l = (e) => {
		e.preventDefault();
		let { x: n } = i(e);
		t.onZoom(n, Math.exp(-e.deltaY * a));
	}, u = () => {
		n.size === 0 && t.onCrosshairLeave();
	};
	function d() {
		let e = [...n.values()], t = e[0], r = e[1];
		return t === void 0 || r === void 0 ? 0 : Math.hypot(t.x - r.x, t.y - r.y);
	}
	function f() {
		let e = [...n.values()], t = e[0], r = e[1];
		return t === void 0 || r === void 0 ? 0 : (t.x + r.x) / 2;
	}
	return e.style.touchAction = "none", e.addEventListener("pointerdown", o), e.addEventListener("pointermove", s), e.addEventListener("pointerup", c), e.addEventListener("pointercancel", c), e.addEventListener("pointerleave", u), e.addEventListener("wheel", l, { passive: !1 }), () => {
		e.removeEventListener("pointerdown", o), e.removeEventListener("pointermove", s), e.removeEventListener("pointerup", c), e.removeEventListener("pointercancel", c), e.removeEventListener("pointerleave", u), e.removeEventListener("wheel", l);
	};
}
//#endregion
//#region core/src/model/bars.ts
var s = 1024, c = class {
	constructor(e = s) {
		r(this, "time", void 0), r(this, "open", void 0), r(this, "high", void 0), r(this, "low", void 0), r(this, "close", void 0), r(this, "volume", void 0), r(this, "offset", 0), r(this, "count", 0);
		let t = Math.max(e, 1);
		this.time = new Float64Array(t), this.open = new Float64Array(t), this.high = new Float64Array(t), this.low = new Float64Array(t), this.close = new Float64Array(t), this.volume = new Float64Array(t);
	}
	get length() {
		return this.count;
	}
	get capacity() {
		return this.time.length;
	}
	timeAt(e) {
		return this.time[this.offset + e];
	}
	openAt(e) {
		return this.open[this.offset + e];
	}
	highAt(e) {
		return this.high[this.offset + e];
	}
	lowAt(e) {
		return this.low[this.offset + e];
	}
	closeAt(e) {
		return this.close[this.offset + e];
	}
	volumeAt(e) {
		return this.volume[this.offset + e];
	}
	barAt(e) {
		let t = this.offset + e;
		return {
			time: this.time[t],
			open: this.open[t],
			high: this.high[t],
			low: this.low[t],
			close: this.close[t],
			volume: this.volume[t]
		};
	}
	setData(e) {
		this.reallocate(Math.max(e.length, s), 0), this.offset = 0, this.count = 0;
		for (let t of e) this.append(t);
	}
	append(e) {
		this.offset + this.count >= this.time.length && this.reallocate(Math.max(this.time.length * 2, s), this.offset), this.write(this.offset + this.count, e), this.count += 1;
	}
	updateLast(e) {
		if (this.count === 0) {
			this.append(e);
			return;
		}
		this.write(this.offset + this.count - 1, e);
	}
	prepend(e) {
		if (e.length !== 0) {
			if (this.offset < e.length) {
				let t = Math.max(e.length, this.count >> 1, s);
				this.reallocate(this.count + t + e.length, t + e.length);
			}
			this.offset -= e.length;
			for (let t = 0; t < e.length; t += 1) this.write(this.offset + t, e[t]);
			this.count += e.length;
		}
	}
	lowHighInRange(e, t) {
		let n = this.offset + Math.max(e, 0), r = this.offset + Math.min(t, this.count - 1);
		if (r < n) return {
			min: NaN,
			max: NaN
		};
		let i = this.low[n], a = this.high[n];
		for (let e = n + 1; e <= r; e += 1) {
			let t = this.low[e], n = this.high[e];
			t < i && (i = t), n > a && (a = n);
		}
		return {
			min: i,
			max: a
		};
	}
	indexOfTime(e) {
		let t = 0, n = this.count - 1;
		for (; t <= n;) {
			let r = t + n >> 1, i = this.time[this.offset + r];
			if (i === e) return r;
			i < e ? t = r + 1 : n = r - 1;
		}
		return n;
	}
	write(e, t) {
		this.time[e] = t.time, this.open[e] = t.open, this.high[e] = t.high, this.low[e] = t.low, this.close[e] = t.close, this.volume[e] = t.volume;
	}
	reallocate(e, t) {
		let n = (n) => {
			let r = new Float64Array(e);
			return r.set(n.subarray(this.offset, this.offset + this.count), t), r;
		};
		this.time = n(this.time), this.open = n(this.open), this.high = n(this.high), this.low = n(this.low), this.close = n(this.close), this.volume = n(this.volume), this.offset = t;
	}
}, l = {
	None: 0,
	Cursor: 1,
	Light: 2,
	Full: 3
}, u = {
	mode: "linear",
	topMargin: .1,
	bottomMargin: .1
}, d = 1e-10, f = class {
	constructor(e = {}) {
		r(this, "height", 0), r(this, "internalMin", 0), r(this, "internalMax", 1), r(this, "base", 1), r(this, "options", void 0), this.options = {
			...u,
			...e
		};
	}
	get mode() {
		return this.options.mode;
	}
	setHeight(e) {
		this.height = Math.max(e, 0);
	}
	setMode(e) {
		this.options.mode = e;
	}
	setBase(e) {
		this.base = e === 0 ? 1 : e;
	}
	setPriceRange(e, t) {
		this.internalMin = this.toInternal(e), this.internalMax = this.toInternal(t), this.guardRange();
	}
	autoScale(e, t) {
		if (!Number.isFinite(e) || !Number.isFinite(t)) return;
		let n = this.toInternal(e), r = this.toInternal(t);
		r < n && ([n, r] = [r, n]);
		let i = r - n;
		i === 0 && (i = Math.abs(r) * .01 || 1, n -= i / 2, r += i / 2), this.internalMin = n - i * this.options.bottomMargin, this.internalMax = r + i * this.options.topMargin, this.guardRange();
	}
	yAt(e) {
		let t = (this.toInternal(e) - this.internalMin) / (this.internalMax - this.internalMin);
		return this.height - t * this.height;
	}
	priceAt(e) {
		let t = (this.height - e) / this.height;
		return this.fromInternal(this.internalMin + t * (this.internalMax - this.internalMin));
	}
	priceRange() {
		return {
			min: this.fromInternal(this.internalMin),
			max: this.fromInternal(this.internalMax)
		};
	}
	toInternal(e) {
		switch (this.options.mode) {
			case "linear": return e;
			case "logarithmic": return Math.log10(Math.max(e, d));
			case "percentage": return (e / this.base - 1) * 100;
		}
	}
	fromInternal(e) {
		switch (this.options.mode) {
			case "linear": return e;
			case "logarithmic": return 10 ** e;
			case "percentage": return (e / 100 + 1) * this.base;
		}
	}
	guardRange() {
		this.internalMax <= this.internalMin && (this.internalMax = this.internalMin + 1);
	}
}, p = {
	barSpacing: 8,
	minBarSpacing: .5,
	maxBarSpacing: 120,
	rightOffset: 0
}, m = (e, t, n) => e < t ? t : e > n ? n : e, h = class {
	constructor(e = {}) {
		r(this, "width", 0), r(this, "barCount", 0), r(this, "spacing", void 0), r(this, "offsetBars", void 0), r(this, "options", void 0), this.options = {
			...p,
			...e
		}, this.spacing = this.options.barSpacing, this.offsetBars = this.options.rightOffset;
	}
	get barSpacing() {
		return this.spacing;
	}
	get rightOffset() {
		return this.offsetBars;
	}
	setWidth(e) {
		this.width = Math.max(e, 0), this.clampOffset();
	}
	setBarCount(e) {
		this.barCount = Math.max(e, 0), this.clampOffset();
	}
	setBarSpacing(e) {
		this.spacing = m(e, this.options.minBarSpacing, this.options.maxBarSpacing), this.clampOffset();
	}
	setRightOffset(e) {
		this.offsetBars = e, this.clampOffset();
	}
	rightEdgeLogical() {
		return this.barCount - 1 + this.offsetBars;
	}
	xAt(e) {
		return this.width - (this.rightEdgeLogical() - e) * this.spacing;
	}
	logicalAt(e) {
		return this.rightEdgeLogical() - (this.width - e) / this.spacing;
	}
	visibleBars() {
		if (this.barCount === 0) return {
			from: 0,
			to: -1
		};
		let e = Math.max(Math.floor(this.logicalAt(0)), 0), t = Math.min(Math.ceil(this.logicalAt(this.width)), this.barCount - 1);
		return {
			from: e,
			to: Math.max(t, e - 1)
		};
	}
	scrollBy(e) {
		this.offsetBars -= e / this.spacing, this.clampOffset();
	}
	zoomAt(e, t) {
		let n = this.logicalAt(e), r = this.spacing;
		if (this.spacing = m(this.spacing * t, this.options.minBarSpacing, this.options.maxBarSpacing), this.spacing === r) return;
		let i = n + (this.width - e) / this.spacing;
		this.offsetBars = i - (this.barCount - 1), this.clampOffset();
	}
	fitContent() {
		this.barCount !== 0 && this.width !== 0 && (this.spacing = m(this.width / this.barCount, this.options.minBarSpacing, this.options.maxBarSpacing), this.offsetBars = .5, this.clampOffset());
	}
	clampOffset() {
		if (this.barCount === 0 || this.width === 0 || this.spacing === 0) return;
		let e = this.width / this.spacing * .75, t = -(this.barCount - 1);
		this.offsetBars = m(this.offsetBars, t, e);
	}
};
//#endregion
//#region core/src/render/candle-renderer.ts
function g(e, t, n) {
	if (t.count === 0) return;
	if (t.wickOnly) {
		_(e, t, n);
		return;
	}
	let r = (t.bodyWidth - 1) / 2;
	for (let i of [1, 0]) {
		e.beginPath();
		for (let n = 0; n < t.count; n += 1) {
			if (t.up[n] !== i) continue;
			let a = t.x[n], o = t.wickTop[n], s = t.wickBottom[n];
			e.rect(a - .5, o, 1, s - o);
			let c = t.bodyTop[n], l = t.bodyBottom[n], u = Math.max(l - c, 1);
			e.rect(a - r - .5, Math.round(c), t.bodyWidth, u);
		}
		e.fillStyle = i === 1 ? n.upColor : n.downColor, e.fill();
	}
}
function _(e, t, n) {
	for (let r of [1, 0]) {
		e.beginPath();
		for (let n = 0; n < t.count; n += 1) {
			if (t.up[n] !== r) continue;
			let i = t.x[n], a = Math.min(t.wickTop[n], t.bodyTop[n]), o = Math.max(t.wickBottom[n], t.bodyBottom[n]);
			e.rect(i - .5, a, 1, Math.max(o - a, 1));
		}
		e.fillStyle = r === 1 ? n.upWickColor : n.downWickColor, e.fill();
	}
}
//#endregion
//#region core/src/render/canvas-layer.ts
var v = class {
	constructor(e, t) {
		r(this, "canvas", void 0), r(this, "ctx", void 0), r(this, "cssWidth", 0), r(this, "cssHeight", 0), this.canvas = e.ownerDocument.createElement("canvas"), this.canvas.style.position = "absolute", this.canvas.style.inset = "0", this.canvas.style.zIndex = String(t), e.appendChild(this.canvas);
		let n = this.canvas.getContext("2d");
		if (n === null) throw Error("canvas 2d context недоступен");
		this.ctx = n;
	}
	get width() {
		return this.cssWidth;
	}
	get height() {
		return this.cssHeight;
	}
	resize(e, t, n) {
		this.cssWidth = e, this.cssHeight = t, this.canvas.width = Math.round(e * n), this.canvas.height = Math.round(t * n), this.canvas.style.width = `${e}px`, this.canvas.style.height = `${t}px`, this.ctx.setTransform(n, 0, 0, n, 0, 0);
	}
	clear() {
		this.ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
	}
	dispose() {
		this.canvas.remove();
	}
}, y = class {
	constructor(e, t = (e) => globalThis.requestAnimationFrame(e), n = (e) => globalThis.cancelAnimationFrame(e)) {
		r(this, "onFrame", void 0), r(this, "requestFrame", void 0), r(this, "cancelFrame", void 0), r(this, "level", l.None), r(this, "handle", 0), r(this, "disposed", !1), r(this, "tick", () => {
			if (this.handle = 0, this.disposed) return;
			let e = this.level;
			this.level = l.None, this.onFrame(e);
		}), this.onFrame = e, this.requestFrame = t, this.cancelFrame = n;
	}
	invalidate(e) {
		this.disposed || e === l.None || (e > this.level && (this.level = e), this.handle === 0 && (this.handle = this.requestFrame(this.tick)));
	}
	flush() {
		if (this.disposed || this.level === l.None) return;
		this.handle !== 0 && (this.cancelFrame(this.handle), this.handle = 0);
		let e = this.level;
		this.level = l.None, this.onFrame(e);
	}
	dispose() {
		this.disposed = !0, this.handle !== 0 && this.cancelFrame(this.handle), this.handle = 0, this.level = l.None;
	}
}, b = class {
	constructor() {
		r(this, "count", 0), r(this, "x", /* @__PURE__ */ new Float32Array()), r(this, "bodyTop", /* @__PURE__ */ new Float32Array()), r(this, "bodyBottom", /* @__PURE__ */ new Float32Array()), r(this, "wickTop", /* @__PURE__ */ new Float32Array()), r(this, "wickBottom", /* @__PURE__ */ new Float32Array()), r(this, "up", /* @__PURE__ */ new Uint8Array()), r(this, "bodyWidth", 1), r(this, "wickOnly", !1);
	}
	ensureCapacity(e) {
		if (this.x.length >= e) return;
		let t = Math.max(e, this.x.length * 2, 1024);
		this.x = new Float32Array(t), this.bodyTop = new Float32Array(t), this.bodyBottom = new Float32Array(t), this.wickTop = new Float32Array(t), this.wickBottom = new Float32Array(t), this.up = new Uint8Array(t);
	}
};
function x(e) {
	let t = Math.floor(e * .8);
	return t < 1 ? 1 : t % 2 == 0 ? t - 1 : t;
}
function S(e, t, n, r, i, a) {
	let o = n - t + 1;
	if (o <= 0) {
		a.count = 0;
		return;
	}
	a.ensureCapacity(o), a.bodyWidth = x(r.barSpacing), a.wickOnly = r.barSpacing < 3;
	for (let n = 0; n < o; n += 1) {
		let o = t + n, s = e.openAt(o), c = e.closeAt(o), l = +(c >= s);
		a.x[n] = Math.round(r.xAt(o)), a.wickTop[n] = i.yAt(e.highAt(o)), a.wickBottom[n] = i.yAt(e.lowAt(o)), a.bodyTop[n] = i.yAt(l === 1 ? c : s), a.bodyBottom[n] = i.yAt(l === 1 ? s : c), a.up[n] = l;
	}
	a.count = o;
}
function C(e, t) {
	if (!(e > 0) || t <= 0) return 1;
	let n = e / t, r = 10 ** Math.floor(Math.log10(n)), i = n / r;
	return (i <= 1 ? 1 : i <= 2 ? 2 : i <= 2.5 ? 2.5 : i <= 5 ? 5 : 10) * r;
}
//#endregion
//#region core/src/render/time-format.ts
var w = 864e5;
function T(e) {
	return e < w ? {
		hour: "2-digit",
		minute: "2-digit"
	} : e < 7 * w ? {
		day: "2-digit",
		month: "short",
		hour: "2-digit",
		minute: "2-digit"
	} : e < 60 * w ? {
		day: "2-digit",
		month: "short"
	} : e < 1095 * w ? {
		month: "short",
		year: "numeric"
	} : { year: "numeric" };
}
var E = class {
	constructor(e) {
		r(this, "locale", void 0), r(this, "cache", /* @__PURE__ */ new Map()), r(this, "current", void 0), r(this, "currentKey", ""), this.locale = e, this.current = this.formatterFor(w);
	}
	setVisibleSpan(e) {
		let t = T(e), n = Object.keys(t).sort().join(",");
		return n !== this.currentKey && (this.currentKey = n, this.current = this.cachedFormatter(n, t), !0);
	}
	format(e) {
		return this.current.format(e);
	}
	formatterFor(e) {
		let t = T(e);
		return this.currentKey = Object.keys(t).sort().join(","), this.cachedFormatter(this.currentKey, t);
	}
	cachedFormatter(e, t) {
		let n = this.cache.get(e);
		return n === void 0 && (n = new Intl.DateTimeFormat(this.locale, t), this.cache.set(e, n)), n;
	}
}, D = {
	background: "#161a25",
	grid: "#232733",
	text: "#8b90a0",
	crosshair: "#5c6272",
	axisLabelBackground: "#2a2e39",
	axisLabelText: "#d6d9e0",
	upColor: "#26a69a",
	downColor: "#ef5350",
	upWickColor: "#26a69a",
	downWickColor: "#ef5350"
}, O = {
	colors: D,
	priceScaleWidth: 64,
	timeScaleHeight: 22,
	priceScaleMode: "linear",
	timeScale: {},
	font: "11px -apple-system, Roboto, \"Helvetica Neue\", sans-serif"
}, k = 44, A = 84, j = class {
	constructor(e, t = {}) {
		r(this, "options", void 0), r(this, "bars", new c()), r(this, "timeScale", void 0), r(this, "priceScale", void 0), r(this, "geometry", new b()), r(this, "emitter", new i()), r(this, "host", void 0), r(this, "mainLayer", void 0), r(this, "overlayLayer", void 0), r(this, "frameLoop", void 0), r(this, "detachInput", void 0), r(this, "resizeObserver", void 0), r(this, "paneWidth", 0), r(this, "paneHeight", 0), r(this, "crosshair", null), r(this, "lastVisible", {
			from: 0,
			to: -1
		}), r(this, "timeFormatter", new E()), r(this, "hasSize", !1), r(this, "fitContentPending", !1), this.options = {
			...O,
			...t,
			colors: {
				...D,
				...t.colors
			}
		}, this.host = e.ownerDocument.createElement("div"), this.host.style.position = "relative", this.host.style.width = "100%", this.host.style.height = "100%", this.host.style.overflow = "hidden", e.appendChild(this.host), this.mainLayer = new v(this.host, 0), this.overlayLayer = new v(this.host, 1), this.timeScale = new h(this.options.timeScale), this.priceScale = new f({ mode: this.options.priceScaleMode }), this.frameLoop = new y((e) => this.draw(e)), this.detachInput = o(this.host, {
			onPan: (e) => {
				this.timeScale.scrollBy(e), this.frameLoop.invalidate(l.Full);
			},
			onZoom: (e, t) => {
				this.timeScale.zoomAt(e, t), this.frameLoop.invalidate(l.Full);
			},
			onCrosshairMove: (e, t) => {
				this.crosshair = {
					x: e,
					y: t
				}, this.emitCrosshair(e, t), this.frameLoop.invalidate(l.Cursor);
			},
			onCrosshairLeave: () => {
				this.crosshair = null, this.emitter.emit("crosshairLeave", void 0), this.frameLoop.invalidate(l.Cursor);
			}
		}), this.resizeObserver = new ResizeObserver(() => this.resize()), this.resizeObserver.observe(e), this.resize();
	}
	on(e, t) {
		return this.emitter.on(e, t);
	}
	setData(e) {
		this.bars.setData(e), this.timeScale.setBarCount(this.bars.length), this.fitContent();
	}
	update(e) {
		let t = this.bars.length;
		t > 0 && this.bars.timeAt(t - 1) === e.time ? this.bars.updateLast(e) : (this.bars.append(e), this.timeScale.setBarCount(this.bars.length)), this.frameLoop.invalidate(l.Full);
	}
	prependHistory(e) {
		this.bars.prepend(e), this.timeScale.setBarCount(this.bars.length), this.frameLoop.invalidate(l.Full);
	}
	setPriceScaleMode(e) {
		this.priceScale.setMode(e), this.frameLoop.invalidate(l.Full);
	}
	fitContent() {
		if (!this.hasSize) {
			this.fitContentPending = !0;
			return;
		}
		this.timeScale.fitContent(), this.frameLoop.invalidate(l.Full);
	}
	visibleBars() {
		return this.timeScale.visibleBars();
	}
	barCount() {
		return this.bars.length;
	}
	resize() {
		let e = this.host.parentElement?.getBoundingClientRect(), t = Math.floor(e?.width ?? 0), n = Math.floor(e?.height ?? 0);
		if (t === 0 || n === 0) return;
		this.hasSize = !0;
		let r = globalThis.devicePixelRatio || 1;
		this.mainLayer.resize(t, n, r), this.overlayLayer.resize(t, n, r), this.paneWidth = Math.max(t - this.options.priceScaleWidth, 0), this.paneHeight = Math.max(n - this.options.timeScaleHeight, 0), this.timeScale.setWidth(this.paneWidth), this.priceScale.setHeight(this.paneHeight), this.fitContentPending && (this.fitContentPending = !1, this.timeScale.fitContent()), this.frameLoop.invalidate(l.Full), this.frameLoop.flush();
	}
	destroy() {
		this.resizeObserver.disconnect(), this.detachInput(), this.frameLoop.dispose(), this.emitter.clear(), this.mainLayer.dispose(), this.overlayLayer.dispose(), this.host.remove();
	}
	draw(e) {
		e >= l.Light && this.drawMain(e === l.Full), this.drawOverlay();
	}
	drawMain(e) {
		let { ctx: t } = this.mainLayer, { colors: n } = this.options;
		t.fillStyle = n.background, t.fillRect(0, 0, this.mainLayer.width, this.mainLayer.height);
		let r = this.timeScale.visibleBars();
		if (r.to >= r.from) {
			this.priceScale.mode === "percentage" && this.priceScale.setBase(this.bars.closeAt(r.from));
			let { min: e, max: t } = this.bars.lowHighInRange(r.from, r.to);
			this.priceScale.autoScale(e, t);
		}
		this.drawGrid(t), r.to >= r.from ? (e && S(this.bars, r.from, r.to, this.timeScale, this.priceScale, this.geometry), t.save(), t.beginPath(), t.rect(0, 0, this.paneWidth, this.paneHeight), t.clip(), g(t, this.geometry, n), t.restore()) : this.geometry.count = 0, this.drawPriceAxis(t), this.drawTimeAxis(t, r), (r.from !== this.lastVisible.from || r.to !== this.lastVisible.to) && (this.lastVisible = r, this.emitter.emit("visibleRangeChange", r));
	}
	priceTickStep() {
		let { min: e, max: t } = this.priceScale.priceRange();
		return C(t - e, Math.max(this.paneHeight / k, 1));
	}
	drawGrid(e) {
		let { colors: t } = this.options, { min: n, max: r } = this.priceScale.priceRange(), i = this.priceTickStep();
		e.beginPath();
		for (let t = Math.ceil(n / i) * i; t <= r; t += i) {
			let n = Math.round(this.priceScale.yAt(t)) + .5;
			e.moveTo(0, n), e.lineTo(this.paneWidth, n);
		}
		e.strokeStyle = t.grid, e.lineWidth = 1, e.stroke();
	}
	drawPriceAxis(e) {
		let { colors: t, font: n, priceScaleWidth: r } = this.options, { min: i, max: a } = this.priceScale.priceRange(), o = this.priceTickStep(), s = Math.max(0, -Math.floor(Math.log10(o)));
		e.fillStyle = t.background, e.fillRect(this.paneWidth, 0, r, this.mainLayer.height), e.font = n, e.fillStyle = t.text, e.textAlign = "left", e.textBaseline = "middle";
		for (let t = Math.ceil(i / o) * o; t <= a; t += o) {
			let n = this.priceScale.yAt(t);
			n < 8 || n > this.paneHeight - 4 || e.fillText(t.toFixed(s), this.paneWidth + 6, n);
		}
	}
	drawTimeAxis(e, t) {
		let { colors: n, font: r } = this.options, i = this.paneHeight;
		if (e.fillStyle = n.background, e.fillRect(0, i, this.mainLayer.width, this.options.timeScaleHeight), e.beginPath(), e.moveTo(0, i + .5), e.lineTo(this.mainLayer.width, i + .5), e.strokeStyle = n.grid, e.stroke(), t.to < t.from) return;
		this.timeFormatter.setVisibleSpan(this.bars.timeAt(t.to) - this.bars.timeAt(t.from));
		let a = Math.max(1, Math.ceil(A / Math.max(this.timeScale.barSpacing, .01)));
		e.font = r, e.fillStyle = n.text, e.textAlign = "center", e.textBaseline = "middle";
		for (let n = t.from; n <= t.to; n += a) {
			let t = this.timeScale.xAt(n);
			t < 20 || t > this.paneWidth - 20 || e.fillText(this.timeFormatter.format(this.bars.timeAt(n)), t, i + 11);
		}
	}
	drawOverlay() {
		let { ctx: e } = this.overlayLayer, { colors: t, font: n } = this.options;
		this.overlayLayer.clear();
		let r = this.crosshair;
		if (r === null || r.x > this.paneWidth || r.y > this.paneHeight) return;
		e.save(), e.setLineDash([4, 4]), e.strokeStyle = t.crosshair, e.lineWidth = 1;
		let i = Math.round(this.timeScale.logicalAt(r.x)), a = Math.round(this.timeScale.xAt(i)) + .5, o = Math.round(r.y) + .5;
		e.beginPath(), e.moveTo(a, 0), e.lineTo(a, this.paneHeight), e.moveTo(0, o), e.lineTo(this.paneWidth, o), e.stroke(), e.restore();
		let s = this.priceScale.priceAt(r.y), c = this.priceTickStep(), l = Math.max(0, -Math.floor(Math.log10(c))), u = s.toFixed(l);
		e.font = n;
		let d = this.options.priceScaleWidth;
		e.fillStyle = t.axisLabelBackground, e.fillRect(this.paneWidth, o - 9, d, 18), e.fillStyle = t.axisLabelText, e.textAlign = "left", e.textBaseline = "middle", e.fillText(u, this.paneWidth + 6, o);
	}
	emitCrosshair(e, t) {
		let n = Math.round(this.timeScale.logicalAt(e)), r = n >= 0 && n < this.bars.length;
		this.emitter.emit("crosshairMove", {
			barIndex: n,
			price: this.priceScale.priceAt(t),
			bar: r ? this.bars.barAt(n) : null
		});
	}
};
function M(e, t) {
	return new j(e, t);
}
//#endregion
//#region core/src/indicators/indicator.ts
var N = class {
	constructor() {
		r(this, "savedState", void 0);
	}
	push(e) {
		return this.savedState = this.captureState(), this.step(e);
	}
	updateLast(e) {
		return this.savedState === void 0 ? this.push(e) : (this.restoreState(this.savedState), this.step(e));
	}
	reset() {
		this.savedState = void 0, this.initState();
	}
}, P = class extends N {
	constructor(e) {
		if (super(), r(this, "period", void 0), r(this, "name", void 0), r(this, "ring", void 0), r(this, "sum", 0), r(this, "filled", 0), r(this, "writeIndex", 0), this.period = e, !Number.isInteger(e) || e < 1) throw RangeError(`период SMA должен быть целым >= 1, получено ${e}`);
		this.name = `SMA(${e})`, this.ring = new Float64Array(e);
	}
	initState() {
		this.ring.fill(0), this.sum = 0, this.filled = 0, this.writeIndex = 0;
	}
	captureState() {
		return {
			sum: this.sum,
			filled: this.filled,
			writeIndex: this.writeIndex,
			evicted: this.ring[this.writeIndex]
		};
	}
	restoreState(e) {
		this.ring[e.writeIndex] = e.evicted, this.sum = e.sum, this.filled = e.filled, this.writeIndex = e.writeIndex;
	}
	step(e) {
		let t = this.writeIndex;
		return this.filled === this.period && (this.sum -= this.ring[t]), this.ring[t] = e.close, this.sum += e.close, this.writeIndex = (t + 1) % this.period, this.filled < this.period && (this.filled += 1), this.filled === this.period ? this.sum / this.period : void 0;
	}
}, F = class extends N {
	constructor(e = 14) {
		if (super(), r(this, "period", void 0), r(this, "name", void 0), r(this, "prevClose", 0), r(this, "hasPrev", !1), r(this, "changes", 0), r(this, "sumGain", 0), r(this, "sumLoss", 0), r(this, "avgGain", 0), r(this, "avgLoss", 0), this.period = e, !Number.isInteger(e) || e < 1) throw RangeError(`период RSI должен быть целым >= 1, получено ${e}`);
		this.name = `RSI(${e})`;
	}
	initState() {
		this.prevClose = 0, this.hasPrev = !1, this.changes = 0, this.sumGain = 0, this.sumLoss = 0, this.avgGain = 0, this.avgLoss = 0;
	}
	captureState() {
		return {
			prevClose: this.prevClose,
			hasPrev: this.hasPrev,
			changes: this.changes,
			sumGain: this.sumGain,
			sumLoss: this.sumLoss,
			avgGain: this.avgGain,
			avgLoss: this.avgLoss
		};
	}
	restoreState(e) {
		this.prevClose = e.prevClose, this.hasPrev = e.hasPrev, this.changes = e.changes, this.sumGain = e.sumGain, this.sumLoss = e.sumLoss, this.avgGain = e.avgGain, this.avgLoss = e.avgLoss;
	}
	step(e) {
		if (!this.hasPrev) {
			this.prevClose = e.close, this.hasPrev = !0;
			return;
		}
		let t = e.close - this.prevClose;
		this.prevClose = e.close;
		let n = t > 0 ? t : 0, r = t < 0 ? -t : 0;
		if (this.changes += 1, this.changes < this.period) {
			this.sumGain += n, this.sumLoss += r;
			return;
		}
		return this.changes === this.period ? (this.sumGain += n, this.sumLoss += r, this.avgGain = this.sumGain / this.period, this.avgLoss = this.sumLoss / this.period) : (this.avgGain = (this.avgGain * (this.period - 1) + n) / this.period, this.avgLoss = (this.avgLoss * (this.period - 1) + r) / this.period), this.avgLoss === 0 ? this.avgGain === 0 ? 50 : 100 : 100 - 100 / (1 + this.avgGain / this.avgLoss);
	}
};
//#endregion
export { c as BarSeries, b as CandleGeometry, j as Chart, D as DEFAULT_COLORS, u as DEFAULT_PRICE_SCALE_OPTIONS, p as DEFAULT_TIME_SCALE_OPTIONS, y as FrameLoop, N as IncrementalIndicator, l as Invalidation, f as PriceScale, F as Rsi, P as Sma, E as TimeAxisFormatter, h as TimeScale, o as attachPointerInput, S as buildCandleGeometry, x as candleBodyWidth, M as createChart, g as drawCandles, C as niceStep, T as timeAxisFormatOptions };
