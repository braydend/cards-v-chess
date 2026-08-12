import { useMediaQuery, MOBILE_LAYOUT_QUERY } from './useMediaQuery'
import { Credits } from './Credits'
import { DesktopHud } from './DesktopHud'
import { MobileHud } from './MobileHud'
import { PackShop } from './PackShop'
import { TowerPanel } from './TowerPanel'
import { VictoryScreen } from './VictoryScreen'

/**
 * The HUD, in one of two layouts.
 *
 * The layout is a viewport-shape decision, not a pointer decision — see the
 * mobile UI spec, section 1. The desktop branch is `DesktopHud`, the previous
 * left-hand panel, moved verbatim; the mobile branch is `MobileHud`, a thin
 * bar plus a deck overlay. The modals are shared and mount here once so both
 * branches get them with no duplication.
 */
export function Hud() {
  const isMobile = useMediaQuery(MOBILE_LAYOUT_QUERY)

  return (
    <div className="hud">
      {isMobile ? <MobileHud /> : <DesktopHud />}
      <TowerPanel />
      <PackShop />
      <VictoryScreen />
      <Credits />
    </div>
  )
}
