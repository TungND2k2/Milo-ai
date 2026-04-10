import { SVGProps } from "react"
import type { Environment } from "../../../src/shared/config-types"
import { getEnvironmentColor } from "../utils/environmentColors"

/**
 * MiloLogoVariable component renders the Milo AI logo with automatic theme adaptation
 * and environment-based color indicators.
 */
const ClineLogoVariable = (props: SVGProps<SVGSVGElement> & { environment?: Environment }) => {
	const { environment, ...svgProps } = props

	// Determine fill color based on environment
	const fillColor = environment ? getEnvironmentColor(environment) : "var(--vscode-icon-foreground)"

	return (
		<svg fill="none" height="200" viewBox="0 0 200 200" width="200" xmlns="http://www.w3.org/2000/svg" {...svgProps}>
			<path d="M50 150L75 50L100 100L125 50L150 150" stroke={fillColor} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round"/>
			<circle cx="100" cy="100" r="70" stroke={fillColor} strokeWidth="10" strokeOpacity="0.2"/>
			<circle cx="75" cy="50" r="10" fill={fillColor}/>
			<circle cx="125" cy="50" r="10" fill={fillColor}/>
			<circle cx="50" cy="150" r="10" fill={fillColor}/>
			<circle cx="150" cy="150" r="10" fill={fillColor}/>
			<circle cx="100" cy="100" r="10" fill={fillColor}/>
		</svg>
	)
}
export default ClineLogoVariable
