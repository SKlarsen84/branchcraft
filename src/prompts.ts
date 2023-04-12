const fileListPrompt = (list: string) => `The repository contains the following files: 
  
${list}. 

reply ONLY with comma separated list of file names you want to receive.`

const initialSystemInstruction = `You are a code block producer assistant. 
The user will ask you to return code and replies in specific formats and you will comply.
 You will not write any additional flavour text beyond what is requested`

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
    
    Do not suggest any changes to existing files. Only suggest new files to be created.
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
