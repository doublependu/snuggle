// Painted faces: the eye and mouth regions of a character's head show one cell each of the atlas
// (tools/blender/face.py paints the cells; the layout comes from the mesh's glTF extras). The face
// blinks on its own, flaps its mouth while talking and holds an expression per dialogue line.
const EXPRESSIONS = {
  neutral: ['open', 'neutral'],
  smile: ['open', 'smile'],
  happy: ['happy', 'smile'],
  sad: ['sad', 'wobbly'],
  worried: ['sad', 'neutral'],
  surprised: ['surprised', 'o'],
  sleepy: ['sleepy', 'neutral'],
  shy: ['happy', 'wobbly'],
};

export class Face {
  constructor(uniforms, layout) {
    this.u = uniforms;
    this.layout = layout;
    this.eyes = 'open';
    this.mouth = 'neutral';
    this.talking = false;
    this.talkT = 0;
    this.open = false;
    this.blinkT = 1 + Math.random() * 3;
    this.hold = false;
    this.apply();
  }

  // Offset (in UV units) from a region's first cell to the named cell; unknown names fall back to cell 0.
  offset(region, name, out) {
    const L = this.layout[region];
    const i = Math.max(0, L.names.indexOf(name));
    out.set((i % L.cols) * L.du, Math.floor(i / L.cols) * L.dv);
  }

  has(region, name) {
    return this.layout[region].names.includes(name);
  }

  set(expr = 'neutral', { eyes, mouth, hold = false } = {}) {
    const [e, m] = EXPRESSIONS[expr] || EXPRESSIONS.neutral;
    this.eyes = eyes || e;
    this.mouth = mouth || m;
    this.hold = hold;
    this.apply();
  }

  talk(on) {
    this.talking = on;
    this.talkT = 0;
    if (!on) this.open = false;
    this.apply();
  }

  apply(blink = false) {
    const eyes = blink && this.has('eyes', 'blink') ? 'blink' : this.eyes;
    let mouth = this.mouth;
    if (this.talking && this.open) mouth = this.mouth === 'smile' && this.has('mouth', 'talk_smile') ? 'talk_smile' : 'talk';
    this.offset('eyes', eyes, this.u.uEye.value);
    this.offset('mouth', mouth, this.u.uMouth.value);
  }

  update(dt) {
    let blink = false;
    if (!this.hold && this.eyes !== 'blink' && this.eyes !== 'happy') {
      this.blinkT -= dt;
      if (this.blinkT < 0.13) blink = true;
      if (this.blinkT < 0) this.blinkT = 1.8 + Math.random() * 4 * (this.eyes === 'sleepy' ? 0.5 : 1);
    }
    if (this.talking) {
      this.talkT -= dt;
      if (this.talkT < 0) {
        this.open = !this.open;
        this.talkT = this.open ? 0.07 + Math.random() * 0.1 : 0.05 + Math.random() * 0.08;
      }
    }
    this.apply(blink);
  }
}
