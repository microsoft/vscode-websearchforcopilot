# docs

## SearchResponse object
| Name              | Value                                                                         | Type                  |
|-------------------|-------------------------------------------------------------------------------|-----------------------|
| _type             | Type hint, which is set to SearchResponse.                                    | String                |
| computation       | The answer to a math expression or unit conversion expression.                | Computation           |
| entities          | A list of entities that are relevant to the search query.                     | EntityAnswer          |
| images            | A list of images that are relevant to the search query.                       | ImageAnswer           |
| news              | A list of news articles that are relevant to the search query.                | NewsAnswer            |
| places            | A list of places that are relevant to the search query.                       | LocalEntityAnswer     |
| queryContext      | The query string that Bing used for the request.                              | QueryContext          |
| rankingResponse   | The order that Bing suggests that you display the search results in.          | RankingResponse       |
| relatedSearches   | A list of related queries made by others.                                     | RelatedSearchAnswer   |
| spellSuggestions  | The query string that likely represents the user's intent.                    | SpellSuggestions      |
| timeZone          | The date and time of one or more geographic locations.                        | TimeZone              |
| translations      | The translation of a word or phrase in the query string to another language.  | TranslationAnswer     |
| videos            | A list of videos that are relevant to the search query.                       | VideosAnswer          |
| webPages          | A list of webpages that are relevant to the search query.                     | WebAnswer             |


## RankingItem object
| Name        | Value                                                                               | Type          |
|-------------|-------------------------------------------------------------------------------------|---------------|
| answerType  | The answer that contains the item to display. For example, News. Use the type to    | String        |
|             | find the answer in the SearchResponse object. The type is the name of a field in    |               |
|             | the SearchResponse object.                                                          |               |
| resultIndex | A zero-based index of the item in the answer. If the item does not include this     | Integer       |
|             | field, display all items in the answer. For example, display all news articles in   |               |
|             | the News answer.                                                                    |               |
| value       | The ID that identifies either an answer to display or an item of an answer to       | Identifiable  |
|             | display. If the ID identifies an answer, display all items of the answer.           |               |

### notes
- this thing is massive
- rankingResponse
    - is a ranking of what to display where on the search results page
    - mainline is the main result column, probably want to look here most
        - contains an array of rankingItems, not all images tho

- wtf is contractual rules?
