## Web Search for Copilot

This extension showcases:

* Chat Participant & Tool APIs
* [prompt-tsx](https://github.com/microsoft/vscode-prompt-tsx)
* How to leverage the language models provided by GitHub Copilot
* Leveraging the Authentication & Secret Storage API to handle API keys provided by users

### Description

Get the most up-to-date and relevant information from the web right in Copilot.

This is powered by one of two different Search Engines:
* [Tavily](http://tavily.com) (default)
* [Bing](https://bing.com)

You can configure this with the `websearch.preferredEngine` setting.

You'll need to acquire an API key from one of these services to use this extension. Upon first use, it will ask you for that key and store it using VS Code's built-in secret storage, and can be managed via VS Code's authentication stack as well just as you would for your GitHub account.

### Chat Participant

This extension contributes the
`@websearch`
chat participant which is capable of handling questions that likely need live information from the internet.
You can invoke it manually using
`@websearch when did Workspace Trust ship in vscode?`
or if you have intent detection enabled,
it will get picked up automatically for web-related questions.

### Chat Tool

This extension contributes the
`#websearch`
chat tool as well which is similar to the participant but is useful for providing context from the web in other chat participants.
For example:
* `@workspace /new #websearch create a new web app written in Python using the most popular framework`

Additionally,
if you are working on your own Chat Particpant or Tool,
you can consume this Chat Tool via the
`vscode.lm.invokeTool`
API.

### Settings

* `websearch.preferredEngine` - Configure the desired search engine.
* `websearch.useSearchResultsDirectly` - Skip the post processing of search results and use raw search results from the search engine instead.

## Trademarks

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft 
trademarks or logos is subject to and must follow 
[Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
Any use of third-party trademarks or logos are subject to those third-party's policies.
