export interface TransparencyBannerProps {
  /**
   * Optional className passthrough. The component's verbatim text is a
   * const inside the component file; consumers MUST NOT override the
   * text (FR25 lock — see ADR-J9-TRANSPARENCY-BANNER-IS-VERBATIM).
   */
  className?: string;
}
