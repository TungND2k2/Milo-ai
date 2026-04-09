import { SVGProps } from "react"
import type { Environment } from "../../../src/shared/config-types"
import { getEnvironmentColor } from "../utils/environmentColors"

const MiloLogo = (props: SVGProps<SVGSVGElement> & { environment?: Environment }) => {
	const { environment, ...svgProps } = props
	const strokeColor = environment ? getEnvironmentColor(environment) : "var(--vscode-icon-foreground)"

	return (
		<svg fill="none" height="50" viewBox="0 0 200 200" width="50" xmlns="http://www.w3.org/2000/svg" {...svgProps}>
			<path
				d="M50 150L75 50L100 100L125 50L150 150"
				stroke={strokeColor}
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="10"
			/>
			<circle cx="100" cy="100" r="70" stroke={strokeColor} strokeOpacity="0.2" strokeWidth="10" />
			<circle cx="75" cy="50" fill={strokeColor} r="10" />
			<circle cx="125" cy="50" fill={strokeColor} r="10" />
			<circle cx="50" cy="150" fill={strokeColor} r="10" />
			<circle cx="150" cy="150" fill={strokeColor} r="10" />
			<circle cx="100" cy="100" fill={strokeColor} r="10" />
		</svg>
	)
}

export default MiloLogo
