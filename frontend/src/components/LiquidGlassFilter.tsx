import { useMemo } from 'react';
import { generateLiquidDisplacementMap } from '../lib/liquid-glass-shader';

export const LIQUID_GLASS_FILTER_ID = 'sf-liquid-glass-refract';

/**
 * Shared SVG displacement filter bank (ported from ITMS LiquidGlass.tsx,
 * originally rdev/liquid-glass-react MIT). Mounted once at the app root so
 * any `.lg-refract` surface can use
 * `backdrop-filter: url(#sf-liquid-glass-refract) blur(22px) saturate(190%)`
 * for Apple-style edge refraction + chromatic aberration on top of frost.
 */
export function LiquidGlassFilter({
  displacementScale = 18,
  aberrationIntensity = 2,
}: {
  displacementScale?: number;
  aberrationIntensity?: number;
}) {
  const mapUrl = useMemo(() => generateLiquidDisplacementMap(160, 160), []);

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none fixed h-0 w-0 overflow-hidden opacity-0"
      width="0"
      height="0"
    >
      <defs>
        <filter
          id={LIQUID_GLASS_FILTER_ID}
          x="-20%"
          y="-20%"
          width="140%"
          height="140%"
          colorInterpolationFilters="sRGB"
        >
          <feImage
            x="0"
            y="0"
            width="100%"
            height="100%"
            result="DISPLACEMENT_MAP"
            href={mapUrl}
            preserveAspectRatio="none"
          />
          <feColorMatrix
            in="DISPLACEMENT_MAP"
            type="matrix"
            values="0.3 0.3 0.3 0 0  0.3 0.3 0.3 0 0  0.3 0.3 0.3 0 0  0 0 0 1 0"
            result="EDGE_INTENSITY"
          />
          <feComponentTransfer in="EDGE_INTENSITY" result="EDGE_MASK">
            <feFuncA type="discrete" tableValues={`0 ${aberrationIntensity * 0.05} 1`} />
          </feComponentTransfer>

          <feOffset in="SourceGraphic" dx="0" dy="0" result="CENTER_ORIGINAL" />

          <feDisplacementMap
            in="SourceGraphic"
            in2="DISPLACEMENT_MAP"
            scale={displacementScale}
            xChannelSelector="R"
            yChannelSelector="G"
            result="RED_DISPLACED"
          />
          <feColorMatrix
            in="RED_DISPLACED"
            type="matrix"
            values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="RED_CHANNEL"
          />

          <feDisplacementMap
            in="SourceGraphic"
            in2="DISPLACEMENT_MAP"
            scale={displacementScale * (1 - aberrationIntensity * 0.05)}
            xChannelSelector="R"
            yChannelSelector="G"
            result="GREEN_DISPLACED"
          />
          <feColorMatrix
            in="GREEN_DISPLACED"
            type="matrix"
            values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="GREEN_CHANNEL"
          />

          <feDisplacementMap
            in="SourceGraphic"
            in2="DISPLACEMENT_MAP"
            scale={displacementScale * (1 - aberrationIntensity * 0.1)}
            xChannelSelector="R"
            yChannelSelector="G"
            result="BLUE_DISPLACED"
          />
          <feColorMatrix
            in="BLUE_DISPLACED"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
            result="BLUE_CHANNEL"
          />

          <feBlend in="GREEN_CHANNEL" in2="BLUE_CHANNEL" mode="screen" result="GB_COMBINED" />
          <feBlend in="RED_CHANNEL" in2="GB_COMBINED" mode="screen" result="RGB_COMBINED" />
          <feGaussianBlur
            in="RGB_COMBINED"
            stdDeviation={Math.max(0.1, 0.5 - aberrationIntensity * 0.1)}
            result="ABERRATED_BLURRED"
          />
          <feComposite in="ABERRATED_BLURRED" in2="EDGE_MASK" operator="in" result="EDGE_ABERRATION" />

          <feComponentTransfer in="EDGE_MASK" result="INVERTED_MASK">
            <feFuncA type="table" tableValues="1 0" />
          </feComponentTransfer>
          <feComposite in="CENTER_ORIGINAL" in2="INVERTED_MASK" operator="in" result="CENTER_CLEAN" />
          <feComposite in="EDGE_ABERRATION" in2="CENTER_CLEAN" operator="over" />
        </filter>
      </defs>
    </svg>
  );
}
