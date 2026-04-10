import { SVGProps } from "react"
import type { Environment } from "../../../src/shared/config-types"
import { getEnvironmentColor } from "../utils/environmentColors"

/**
 * MiloLogoSanta component renders the Milo AI logo with a festive Santa hat.
 */
const ClineLogoSanta = (props: SVGProps<SVGSVGElement> & { environment?: Environment }) => {
	const { environment, ...svgProps } = props

	// Determine fill color based on environment
	const fillColor = environment ? getEnvironmentColor(environment) : "var(--vscode-icon-foreground)"

	return (
		<svg fill="none" height="200" viewBox="0 0 220 220" width="220" xmlns="http://www.w3.org/2000/svg" {...svgProps}>
			{/* Milo AI logo */}
			<g transform="translate(10, 20)">
				<path d="M50 150L75 50L100 100L125 50L150 150" stroke={fillColor} strokeWidth="10" strokeLinecap="round" strokeLinejoin="round"/>
				<circle cx="100" cy="100" r="70" stroke={fillColor} strokeWidth="10" strokeOpacity="0.2"/>
				<circle cx="75" cy="50" r="10" fill={fillColor}/>
				<circle cx="125" cy="50" r="10" fill={fillColor}/>
				<circle cx="50" cy="150" r="10" fill={fillColor}/>
				<circle cx="150" cy="150" r="10" fill={fillColor}/>
				<circle cx="100" cy="100" r="10" fill={fillColor}/>
			</g>
			{/* Santa hat */}
			<path d="M60 45 L110 5 L160 45" fill="#CC3333" stroke="#CC3333" strokeWidth="4" strokeLinejoin="round"/>
			<rect x="50" y="40" width="120" height="15" rx="7" fill="white"/>
			<circle cx="112" cy="5" r="10" fill="white"/>
		</svg>
	)
}
export default ClineLogoSanta
