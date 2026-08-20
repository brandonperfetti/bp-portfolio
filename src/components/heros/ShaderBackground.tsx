'use client'

import {
  Aurora,
  Blob,
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
  if (preset === 'static-noise-4') {
    // "Static Noise 4" (light mode, §23) adapted: white gradient with a soft
    // right-anchored blob recolored teal→emerald to match the site accent
    // (the preset's stock blue→violet read as an off-palette lavender wash —
    // staging feedback). The preset's 16k-particle logo layer is a logo
    // shader (needs a brand SVG/SDF) and is intentionally omitted for a
    // background role.
    return (
      <Shader style={canvasStyle} toneMapping="neutral">
        <LinearGradient
          stops={[
            { color: '#ffffff', position: 0 },
            { color: '#ffffff', position: 1 },
          ]}
        />
        <Blob
          center={{ x: 0.89, y: 0.57 }}
          highlightIntensity={0.3}
          opacity={0.54}
          size={0.5977}
          softness={1}
          stops={[
            { color: '#5eead4', position: 0 },
            { color: '#10b981', position: 1 },
          ]}
          visible={true}
        />
        <FilmGrain strength={0.3} />
      </Shader>
    )
  }

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
