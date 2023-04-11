import { calculateTokens } from './tokens.js'

export function parseCodeSuggestions(text: string) {
  let jsonText = text

  //if the text contains 3 backticks, then it seems chatGPT is returning a code block with the code suggestions - we may need to parse it differently

  if (text.includes('```')) {
    jsonText = extractJSONString(text) as string

    if (!jsonText) {
      console.error('Failed to extract JSON string from the response.')
      return null
    }
  }

  // Custom function to safely parse JSON string
  const safelyParseJSON = (jsonString: string): any => {
    try {
      const parsed = JSON.parse(jsonString)
      if (parsed && typeof parsed === 'object') {
        return parsed
      }
    } catch (e) {
      console.error('Error parsing JSON:', e)
    }
    return null
  }

  // Parse the response
  const codeSuggestions = safelyParseJSON(jsonText)
  if (!codeSuggestions) {
    console.error('Failed to parse code suggestions.')
  }

  return codeSuggestions
}

function extractJSONString(text: string): string | null {
  //find content between triple backticks
  const regex = /```([\s\S]*?)```/gm
  const matches = regex.exec(text)
  if (matches && matches.length > 1) {
    return matches[1]
  }
  return null // no match
}

function trimConversationWithinTokenLimit(conversation: { role: string; content: string }[], tokenLimit: number) {
  let currentTokens = 0

  // Calculate the total tokens in the conversation
  for (const msg of conversation) {
    currentTokens += calculateTokens(msg.content)
  }

  // If the conversation is already within the token limit, return it as is
  if (currentTokens <= tokenLimit) {
    return conversation
  }

  // Always include the user's initial content prompt.
  const initialPrompt = conversation.find(msg => msg.role === 'user')
  if (initialPrompt) {
    currentTokens = calculateTokens(initialPrompt.content)
  }

  // Remove messages from the conversation until it fits within the token limit
  const trimmedConversation = initialPrompt ? [initialPrompt] : []
  for (let i = conversation.length - 1; i >= 0; i--) {
    const msg = conversation[i]
    const msgTokens = calculateTokens(msg.content)

    if (currentTokens + msgTokens <= tokenLimit) {
      currentTokens += msgTokens
      trimmedConversation.unshift(msg)
    } else {
      // Check if removing the message will bring the conversation within the token limit
      const potentialTokens = currentTokens - msgTokens
      if (potentialTokens <= tokenLimit) {
        // If removing the message brings the conversation within the token limit, remove it
        currentTokens = potentialTokens
      }
    }
  }

  return trimmedConversation
}

export function extractRequestedFiles(text: string) {
  const files = text.split(',').map(file => file.trim())

  return files
}
