const fileListPrompt = (list: string) => `The repository contains the following files: 
  
${list}. 

Please reply only with a non formatted comma separeted list of the files you deem interesting for the task`

const initialSystemInstruction = `You are a helpful AI that will assist the user in providing code suggestions for their project based on their request.`

const instructionPrompt = (instructions: string) =>
  `The user has provided the following special instructions: ${instructions}`

const featurePrompt = (feature: string) => `The user has requested the following feature: ${feature}`

const fileContentPrompt = (fileName: string, fileContent: string) => `File transmission start

File name: ${fileName}
Content: ${fileContent}

File transmission end. Please reply only with the word OK.`

const getSuggestionsPrompt = (
  content: string,
  languages: string
) => `You have received all the requested file contents. Please provide the code suggestions for adding functionality described here:

    ${content}

    The code should be written in the following language(s): ${languages}.

    The format of your reply must be this:

    [
    {
    "filePath": "./file.ext",
    "fileContent": "file content here"
    },
    ...
    ]
    
    
   reply ONLY with a code block containing this JSON array 
    `

//export all
export {
  fileListPrompt,
  initialSystemInstruction,
  instructionPrompt,
  featurePrompt,
  fileContentPrompt,
  getSuggestionsPrompt
}
