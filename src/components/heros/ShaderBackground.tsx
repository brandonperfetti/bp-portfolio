'use client'

import {
  Aurora,
  Circle,
  FilmGrain,
  LinearGradient,
  RectangularCoordinates,
  Shader,
  Swirl,
} from 'shaders/react'

import type { ShaderPresetKey } from './presets'

const canvasStyle = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
} as const

/**
 * The WebGPU canvas for the hero background (client-only — never SSR this).
 *
 * @remarks One `<Shader>` per effect area; effects composed as children
 * (shaders://guidelines). The aurora layer carries a right-side-reveal
 * in-shader mask (hero-section-masking Pro Note) so it fades out under the
 * left-aligned hero text — GPU masking, not CSS.
 */
export default function ShaderBackground({
  preset,
}: {
  preset: ShaderPresetKey
}) {
  if (preset === 'drifting-lights-8') {
    // "Drifting Lights 8" — understated dark-navy gradient + faint grid + grain.
    return (
      <Shader style={canvasStyle}>
        <LinearGradient
          angle={{
            mode: 'loop',
            type: 'auto-animate',
            speed: 1,
            easing: 'linear',
            outputMax: 360,
            outputMin: 0,
          }}
          colorA="#212538"
          colorB="#171b1f"
          colorSpace="oklab"
        />
        <RectangularCoordinates edges="stretch" scale={3} />
        <FilmGrain strength={0.1} />
      </Shader>
    )
  }

  // Default: "Northern Lights 2" aurora, masked away from the text zone.
  return (
    <Shader style={canvasStyle}>
      <Swirl colorA="#0b1329" colorB="#0c0f17" detail={1.6} />
      <Circle
        id="heroMask"
        visible={false}
        color="#ffffff"
        radius={2}
        softness={1}
        center={{ x: 1, y: 0.5 }}
      />
      <Aurora
        balance={73}
        blendMode="linearDodge"
        center={{ x: 0, y: 0.28 }}
        colorA="#8d54ff"
        colorB="#29ff8d"
        colorC="#1122d9"
        colorSpace="oklab"
        curtainCount={1}
        intensity={70}
        maskSource="heroMask"
        rayDensity={7}
        seed={14}
        speed={5.6}
        waviness={193}
      />
      <FilmGrain strength={0.08} />
    </Shader>
  )
}
