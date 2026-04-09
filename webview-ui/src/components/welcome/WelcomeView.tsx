import { BooleanRequest } from "@shared/proto/cline/common"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"
import { memo, useEffect, useState } from "react"
import { ApiKeyField } from "@/components/settings/common/ApiKeyField"
import { DebouncedTextField } from "@/components/settings/common/DebouncedTextField"
import { useApiConfigurationHandlers } from "@/components/settings/utils/useApiConfigurationHandlers"
import { useExtensionState } from "@/context/ExtensionStateContext"
import { StateServiceClient } from "@/services/grpc-client"
import { validateApiConfiguration } from "@/utils/validate"

const WelcomeView = memo(() => {
	const { apiConfiguration, mode } = useExtensionState()
	const [apiErrorMessage, setApiErrorMessage] = useState<string | undefined>(undefined)
	const { handleFieldChange, handleModeFieldChange } = useApiConfigurationHandlers()

	const disableLetsGoButton = apiErrorMessage != null

	// Set provider to openai (OpenAI-compatible) on mount
	useEffect(() => {
		handleModeFieldChange({ plan: "planModeApiProvider", act: "actModeApiProvider" }, "openai", mode)
	}, [])

	const handleSubmit = async () => {
		try {
			await StateServiceClient.setWelcomeViewCompleted(BooleanRequest.create({ value: true }))
		} catch (error) {
			console.error("Failed to complete welcome view:", error)
		}
	}

	useEffect(() => {
		setApiErrorMessage(validateApiConfiguration(mode, apiConfiguration))
	}, [apiConfiguration, mode])

	return (
		<div className="fixed inset-0 p-0 flex flex-col">
			<div className="h-full px-5 overflow-auto flex flex-col gap-2.5">
				<h2 className="text-lg font-semibold mt-4">Welcome to Milo AI</h2>

				<p className="text-(--vscode-descriptionForeground)">
					AI coding agent powered by your local LLM. Enter your API connection details below to get started.
				</p>

				<div className="flex flex-col gap-2 mt-2">
					<div>
						<span style={{ fontWeight: 500, display: "block", marginBottom: 4 }}>API Base URL</span>
						<DebouncedTextField
							initialValue={apiConfiguration?.openAiBaseUrl || ""}
							onChange={(value) => handleFieldChange("openAiBaseUrl", value)}
							placeholder="https://api.inferx.x-or.cloud/v1"
							style={{ width: "100%" }}
							type="text"
						/>
					</div>

					<ApiKeyField
						initialValue={apiConfiguration?.openAiApiKey || ""}
						onChange={(value) => handleFieldChange("openAiApiKey", value)}
						providerName="API"
					/>

					<DebouncedTextField
						initialValue={
							(mode === "plan"
								? apiConfiguration?.planModeOpenAiModelId
								: apiConfiguration?.actModeOpenAiModelId) || ""
						}
						onChange={(value) =>
							handleModeFieldChange({ plan: "planModeOpenAiModelId", act: "actModeOpenAiModelId" }, value, mode)
						}
						placeholder="gemma4"
						style={{ width: "100%" }}>
						<span style={{ fontWeight: 500 }}>Model ID</span>
					</DebouncedTextField>
				</div>

				{apiErrorMessage && (
					<p style={{ fontSize: "12px", color: "var(--vscode-errorForeground)", margin: 0 }}>{apiErrorMessage}</p>
				)}

				<VSCodeButton className="mt-3 w-full" disabled={disableLetsGoButton} onClick={handleSubmit}>
					Let's go!
				</VSCodeButton>
			</div>
		</div>
	)
})

export default WelcomeView
