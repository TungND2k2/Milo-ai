import { SVGProps } from "react"

const ClineLogoWhite = (props: SVGProps<SVGSVGElement>) => (
	<svg fill="none" height="200" viewBox="0 0 200 200" width="200" xmlns="http://www.w3.org/2000/svg" {...props}>
		<path d="M50 150L75 50L100 100L125 50L150 150" stroke="white" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round"/>
		<circle cx="100" cy="100" r="70" stroke="white" strokeWidth="10" strokeOpacity="0.2"/>
		<circle cx="75" cy="50" r="10" fill="white"/>
		<circle cx="125" cy="50" r="10" fill="white"/>
		<circle cx="50" cy="150" r="10" fill="white"/>
		<circle cx="150" cy="150" r="10" fill="white"/>
		<circle cx="100" cy="100" r="10" fill="white"/>
	</svg>
)
export default ClineLogoWhite
