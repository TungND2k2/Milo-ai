import { useCallback, useState } from "react"
import ClineLogoWhite from "@/assets/ClineLogoWhite"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { StateServiceClient } from "@/services/grpc-client"
import { useApiConfigurationHandlers } from "../settings/utils/useApiConfigurationHandlers"

const OnboardingView = () => {
	const { handleFieldsChange } = useApiConfigurationHandlers()
	const { hideSettings, hideAccount, setShowWelcome } = useExtensionState()

	const [apiBaseUrl, setApiBaseUrl] = useState("")
	const [apiKey, setApiKey] = useState("")
	const [isLoading, setIsLoading] = useState(false)
	const [error, setError] = useState("")

	const handleFinish = useCallback(async () => {
		if (!apiBaseUrl.trim()) {
			setError("Please enter an API Base URL")
			return
		}
		if (!apiKey.trim()) {
			setError("Please enter an API Key")
			return
		}
		setError("")
		setIsLoading(true)

		try {
			await handleFieldsChange({
				planModeApiProvider: "openai",
				actModeApiProvider: "openai",
				openAiBaseUrl: apiBaseUrl.trim(),
				openAiApiKey: apiKey.trim(),
				planModeApiModelId: "gemma4",
				actModeApiModelId: "gemma4",
			})

			await StateServiceClient.setWelcomeViewCompleted({ value: true }).catch(() => {})
			setShowWelcome(false)
			hideAccount()
			hideSettings()
		} catch (e) {
			setError("Failed to save configuration. Please try again.")
		} finally {
			setIsLoading(false)
		}
	}, [apiBaseUrl, apiKey, handleFieldsChange, hideAccount, hideSettings, setShowWelcome])

	return (
		<div className="fixed inset-0 p-0 flex flex-col w-full">
			<div className="h-full px-5 xs:mx-10 overflow-auto flex flex-col gap-6 items-center justify-center">
				<ClineLogoWhite className="size-16 flex-shrink-0" />
				<h2 className="text-lg font-semibold p-0 flex-shrink-0">Welcome to Milo AI</h2>
				<p className="text-foreground/70 text-sm text-center m-0 p-0 flex-shrink-0">
					Enter your API provider details to get started.
				</p>

				<div className="flex w-full max-w-md flex-col gap-4">
					<div className="flex flex-col gap-1.5">
						<label className="text-sm font-medium text-foreground">API Base URL</label>
						<Input
							autoFocus
							className="focus-visible:border-button-background"
							onChange={(e) => setApiBaseUrl(e.target.value)}
							placeholder="https://api.example.com/v1"
							type="url"
							value={apiBaseUrl}
						/>
					</div>

					<div className="flex flex-col gap-1.5">
						<label className="text-sm font-medium text-foreground">API Key</label>
						<Input
							className="focus-visible:border-button-background"
							onChange={(e) => setApiKey(e.target.value)}
							placeholder="sk-..."
							type="password"
							value={apiKey}
						/>
					</div>

					{error && <p className="text-destructive text-sm m-0">{error}</p>}
				</div>

				<footer className="flex w-full max-w-md flex-col gap-3 my-2 px-2 flex-shrink-0">
					<Button
						className={`w-full rounded-xs ${isLoading ? "animate-pulse" : ""}`}
						disabled={isLoading}
						onClick={handleFinish}
						variant="default">
						Get Started
					</Button>
				</footer>
			</div>
		</div>
	)
}

export default OnboardingView
