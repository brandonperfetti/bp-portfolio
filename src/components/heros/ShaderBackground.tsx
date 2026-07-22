'use client'

import { Aurora, FilmGrain, Shader, Swirl } from 'shaders/react'

import type { ShaderPresetKey } from './presets'

/**
 * The WebGPU canvas for the hero background (client-only — never SSR this).
 *
 * @remarks One `<Shader>` per effect area (shaders://guidelines); effects are
 * composed as children, FilmGrain last so it stylizes the whole stack via
 * sibling fallback. Grain strength follows the finishing-touches Pro Note's
 * dark-background calibration.
 */
export default function ShaderBackground({
  preset,
}: {
  preset: ShaderPresetKey
}) {
  // Northern Lights 2 (preset d7f61086-8561-4ffa-a8a8-35e078b402a3) is the
  // confirmed default (§23). Other §23 presets can be added here — swapping
  // is a one-line change in the registry.
  void preset
  return (
    <Shader
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
    >
      <Swirl colorA="#0b1329" colorB="#0c0f17" detail={1.6} />
      <Aurora
        balance={73}
        blendMode="linearDodge"
        center={{ x: 0, y: 0.28 }}
        colorA="#8d54ff"
        colorB="#29ff8d"
        colorC="#1122d9"
        colorSpace="oklab"
        curtainCount={1}
        intensity={83}
        rayDensity={7}
        seed={14}
        speed={5.6}
        waviness={193}
      />
      <FilmGrain strength={0.1} />
    </Shader>
  )
}
