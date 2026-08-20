import Image from 'next/image'
import clsx from 'clsx'

import { HoverMotionCard } from '@/components/motion/HoverMotionCard'
import { ParallaxGroup } from '@/components/motion/ParallaxGroup'
import { ScrollReveal } from '@/components/motion/ScrollReveal'
import { getOptimizedImageUrl } from '@/lib/image-utils'

/**
 * Parallax photo strip — the home-page gallery, extracted so the PhotoStrip
 * CMS block renders the identical surface on any admin-composed page.
 *
 * @remarks Rotation and parallax-speed sequences cycle, so any image count
 * works, though ~5 fills the strip best. Honors reduced motion via the GSAP
 * wrappers (ScrollReveal/ParallaxGroup render static DOM when set).
 *
 * @param images Resolved image URLs (Cloudinary URLs get f_auto/q_auto
 * transforms; other hosts pass through untouched).
 * @param priority Mark the first photo as LCP-priority (home hero slot only).
 */
export function PhotoStrip({
  images,
  priority = false,
}: {
  images: string[]
  priority?: boolean
}) {
  const rotations = [
    'rotate-2',
    '-rotate-2',
    'rotate-2',
    'rotate-2',
    '-rotate-2',
  ]
  const parallaxSpeeds = [0.8, -0.55, 0.95, -0.45, 0.7]

  if (!images.length) return null

  return (
    <ScrollReveal y={30} duration={0.96} start="top 92%">
      <ParallaxGroup amount={10} start="top 95%" end="bottom 10%">
        <div className="mt-16 sm:mt-20">
          <div className="-my-4 flex justify-center gap-5 overflow-hidden py-4 sm:gap-8">
            {images.map((image, imageIndex) => (
              <div
                key={image}
                className={clsx(
                  'relative w-44 flex-none overflow-hidden rounded-xl bg-zinc-100 will-change-transform sm:w-72 sm:rounded-2xl dark:bg-zinc-800',
                  rotations[imageIndex % rotations.length],
                )}
                data-parallax-item
                data-parallax-speed={
                  parallaxSpeeds[imageIndex % parallaxSpeeds.length]
                }
              >
                <HoverMotionCard
                  y={0}
                  scale={1}
                  imageScale={1.035}
                  className="h-full"
                >
                  <div className="aspect-9/10">
                    <Image
                      src={getOptimizedImageUrl(image, {
                        width: 1000,
                        height: 1125,
                        crop: 'fill',
                      })}
                      alt=""
                      width={1200}
                      height={1400}
                      sizes="(min-width: 640px) 18rem, 11rem"
                      priority={priority && imageIndex === 0}
                      data-hover-image
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  </div>
                </HoverMotionCard>
              </div>
            ))}
          </div>
        </div>
      </ParallaxGroup>
    </ScrollReveal>
  )
}
