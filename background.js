chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'getProfessorRating') {
        searchProfessor(request.professorName, request.schoolId)
            .then(data => sendResponse({ success: true, data: data }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true;
    }
});

async function searchProfessor(professorName, schoolId) {
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
        let response = await fetch('https://www.ratemyprofessors.com/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
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

        if (data.data && data.data.newSearch && data.data.newSearch.teachers.edges.length > 0) {
            let professor = data.data.newSearch.teachers.edges[0].node;
            return {
                id: professor.id,
                legacyId: professor.legacyId,
                firstName: professor.firstName,
                lastName: professor.lastName,
                department: professor.department,
                avgRating: professor.avgRating ? professor.avgRating.toFixed(1) : 'N/A',
                avgDifficulty: professor.avgDifficulty ? professor.avgDifficulty.toFixed(1) : 'N/A',
                numRatings: professor.numRatings || 0,
                wouldTakeAgainPercent: professor.wouldTakeAgainPercent !== null ? Math.round(professor.wouldTakeAgainPercent) : 'N/A'
            };
        }

        throw new Error('Professor not found');

    } catch (error) {
        console.error('RMP API Error:', error);
        throw error;
    }
}