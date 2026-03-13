/**
 * Particle Simulation
 *
 * CPU-side particle emission and physics update using an object pool.
 */
import type { Particle, ParticleEmitterConfig } from '../types/particle';

const MAX_PARTICLES = 10000;

export class ParticleSimulation {
  private readonly pool: Particle[] = [];
  private activeCount = 0;
  private emitAccumulator = 0;

  constructor() {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.pool.push(createDeadParticle());
    }
  }

  /** Emit particles according to config and elapsed time */
  emit(config: ParticleEmitterConfig, dt: number): void {
    this.emitAccumulator += config.rate * dt;
    const count = Math.floor(this.emitAccumulator);
    this.emitAccumulator -= count;

    for (let i = 0; i < count; i++) {
      const slot = this.findDeadSlot();
      if (slot < 0) break;

      const p = this.pool[slot]!;
      initParticle(p, config);
      p.active = true;
      if (slot >= this.activeCount) {
        this.activeCount = slot + 1;
      }
    }
  }

  /** Update all active particles */
  update(dt: number): void {
    let maxActive = 0;
    for (let i = 0; i < this.activeCount; i++) {
      const p = this.pool[i]!;
      if (!p.active) continue;

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      maxActive = i + 1;
    }
    this.activeCount = maxActive;
  }

  /** Get buffer data for rendering: [x, y, size, r, g, b, a] per particle */
  getInstanceData(): { data: Float32Array; count: number } {
    const stride = 7; // x, y, size, r, g, b, a
    const data = new Float32Array(this.activeCount * stride);
    let count = 0;

    for (let i = 0; i < this.activeCount; i++) {
      const p = this.pool[i]!;
      if (!p.active) continue;

      const t = 1 - p.life / p.maxLife;
      const offset = count * stride;
      data[offset] = p.x;
      data[offset + 1] = p.y;
      data[offset + 2] = lerp(p.size, p.sizeEnd, t);
      data[offset + 3] = lerp(p.r, p.rEnd, t);
      data[offset + 4] = lerp(p.g, p.gEnd, t);
      data[offset + 5] = lerp(p.b, p.bEnd, t);
      data[offset + 6] = lerp(p.opacity, p.opacityEnd, t);
      count++;
    }

    return { data, count };
  }

  getActiveCount(): number {
    let count = 0;
    for (let i = 0; i < this.activeCount; i++) {
      if (this.pool[i]!.active) count++;
    }
    return count;
  }

  reset(): void {
    for (let i = 0; i < this.activeCount; i++) {
      this.pool[i]!.active = false;
    }
    this.activeCount = 0;
    this.emitAccumulator = 0;
  }

  private findDeadSlot(): number {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (!this.pool[i]!.active) return i;
    }
    return -1;
  }
}

function createDeadParticle(): Particle {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 1,
    size: 1,
    sizeEnd: 0,
    opacity: 1,
    opacityEnd: 0,
    r: 1,
    g: 1,
    b: 1,
    a: 1,
    rEnd: 1,
    gEnd: 1,
    bEnd: 1,
    aEnd: 0,
    rotation: 0,
    active: false,
  };
}

function initParticle(p: Particle, config: ParticleEmitterConfig): void {
  // Position at emitter origin
  p.x = 0;
  p.y = 0;

  // Randomize lifetime
  p.maxLife = randRange(config.lifetime[0], config.lifetime[1]);
  p.life = p.maxLife;

  // Randomize velocity
  const speed = randRange(config.speed[0], config.speed[1]);
  const angle = config.direction + (Math.random() - 0.5) * config.spread;
  p.vx = Math.cos(angle) * speed + config.gravity[0];
  p.vy = Math.sin(angle) * speed + config.gravity[1];

  // Size
  p.size = config.size[0];
  p.sizeEnd = config.size[1];

  // Opacity
  p.opacity = config.opacity[0];
  p.opacityEnd = config.opacity[1];

  // Color
  p.r = config.color[0];
  p.g = config.color[1];
  p.b = config.color[2];
  p.a = config.color[3];
  p.rEnd = config.colorEnd[0];
  p.gEnd = config.colorEnd[1];
  p.bEnd = config.colorEnd[2];
  p.aEnd = config.colorEnd[3];

  // Random rotation
  p.rotation = Math.random() * Math.PI * 2;
}

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
