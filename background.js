// Listen for messages from the content script asking for professor data
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('RateMySchedule Background: Received request', request);

    if (request.type === 'getProfessorRating') {
        // Search for the professor and send back the results
        searchProfessor(request.professorName, request.schoolId)
            .then(data => {
                console.log('RateMySchedule Background: Found professor data', data);
                sendResponse({ success: true, data: data });
            })
            .catch(error => {
                console.error('RateMySchedule Background: Error finding professor', error);
                sendResponse({ success: false, error: error.message });
            });

        // Keep the message channel open for async response
        return true;
    }
});

async function searchProfessor(professorName, schoolId) {
    console.log(`RateMySchedule Background: Searching for "${professorName}" at school ID "${schoolId}"`);

    // This is the GraphQL query that RateMyProfessors uses internally
    // We're essentially asking: "Find teachers at this school whose name matches our search"
    let query = `
    query NewSearchTeachersQuery($text: String!, $schoolID: ID!) {
      newSearch {
        teachers(query: {text: $text, schoolID: $schoolID}) {
          edges {
            node {
              id
              legacyId
              firstName
              lastName
              department
              school {
                name
              }
              avgRating
              numRatings
              avgDifficulty
              wouldTakeAgainPercent
            }
          }
        }
      }
    }
  `;

    try {
        console.log('RateMySchedule Background: Making API call to RMP');

        // Make the API call to RateMyProfessors
        let response = await fetch('https://www.ratemyprofessors.com/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Basic auth that RMP uses - this is their public API
                'Authorization': 'Basic dGVzdDp0ZXN0'
            },
            body: JSON.stringify({
                query: query,
                variables: {
                    text: professorName,
                    schoolID: schoolId
                }
            })
        });

        let data = await response.json();
        console.log('RateMySchedule Background: API response', data);

        // Check if we found any professors
        if (data.data && data.data.newSearch && data.data.newSearch.teachers.edges.length > 0) {
            // Take the first result (usually the best match)
            let professor = data.data.newSearch.teachers.edges[0].node;

            console.log('RateMySchedule Background: Professor found', professor);

            // Return the professor data in a clean format
            return {
                id: professor.id,
                legacyId: professor.legacyId,
                firstName: professor.firstName,
                lastName: professor.lastName,
                department: professor.department,
                // Round ratings to 1 decimal place for readability
                avgRating: professor.avgRating ? professor.avgRating.toFixed(1) : 'N/A',
                avgDifficulty: professor.avgDifficulty ? professor.avgDifficulty.toFixed(1) : 'N/A',
                numRatings: professor.numRatings || 0,
                // Convert to percentage and round to whole number
                wouldTakeAgainPercent: professor.wouldTakeAgainPercent !== null ? Math.round(professor.wouldTakeAgainPercent) : 'N/A'
            };
        }

        // If we get here, no professor was found
        console.log('RateMySchedule Background: No professors found in response');
        throw new Error('Professor not found at this school');

    } catch (error) {
        console.error('RateMySchedule Background: API Error:', error);
        throw error;
    }
}