import { memo } from "react"
import { QuoteButtonState } from "./ChatRow"
import { MarkdownRow } from "./MarkdownRow"
import QuoteButton from "./QuoteButton"

interface CompletionOutputRowProps {
	text: string
	quoteButtonState: QuoteButtonState
	handleQuoteClick: () => void
	headClassNames?: string
	showActionRow?: boolean
	seeNewChangesDisabled: boolean
	setSeeNewChangesDisabled: (value: boolean) => void
	explainChangesDisabled: boolean
	setExplainChangesDisabled: (value: boolean) => void
	messageTs: number
}

export const CompletionOutputRow = memo(({ text, quoteButtonState, handleQuoteClick }: CompletionOutputRowProps) => {
	return (
		<div>
			<div className="w-full relative">
				<div className="p-1 w-full [&_p:last-child]:mb-0">
					<MarkdownRow markdown={text} />
					{quoteButtonState.visible && (
						<QuoteButton left={quoteButtonState.left} onClick={handleQuoteClick} top={quoteButtonState.top} />
					)}
				</div>
			</div>
		</div>
	)
})

CompletionOutputRow.displayName = "CompletionOutputRow"
