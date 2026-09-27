// Posting-schedule Autofill: fills every unassigned post at every posting
// time with a free team. A completely empty schedule gets a simple rotation;
// otherwise, per post, teams are preferred in the order never-been-here >
// completed a full rotation > been here but not in an adjacent slot > would
// be adjacent (same post in the previous/next time column). Posts with the
// fewest non-adjacent options are filled first. Existing assignments are
// kept. Used by PostingScheduleModal and root's public features demo.

export type PostingAssignments = { [time: string]: { [post: string]: string } };

/**
 * @param times posting times in chronological order (not sorted here —
 *   lexicographic order breaks overnight ranges like "23:00","00:00")
 * @param posts post keys (names)
 * @param staffTeams team names available for posting
 * @param current existing assignments; left untouched
 */
export function computeAutofillAssignments(
  times: string[],
  posts: string[],
  staffTeams: string[],
  current: PostingAssignments
): PostingAssignments {
  const updatedAssignments: PostingAssignments = {};

  times.forEach(time => {
    updatedAssignments[time] = { ...(current[time] || {}) };
  });

  const isCompletelyEmpty = times.every(time =>
    posts.every(postKey => {
      const assignment = current[time]?.[postKey];
      return !assignment || assignment === "" || assignment === "Unassigned";
    })
  );

  if (isCompletelyEmpty) {
    times.forEach((time, timeIndex) => {
      posts.forEach((postKey, postIndex) => {
        const teamIndex = (postIndex + timeIndex) % staffTeams.length;
        const assignedTeam = staffTeams[teamIndex];
        updatedAssignments[time][postKey] = assignedTeam;
      });
    });
  } else {
    const teamPostHistory: { [team: string]: Set<string> } = {};
    staffTeams.forEach(team => {
      teamPostHistory[team] = new Set<string>();
    });

    times.forEach(time => {
      posts.forEach(postKey => {
        const assignment = updatedAssignments[time]?.[postKey];
        if (assignment && assignment !== "" && assignment !== "Unassigned" && staffTeams.includes(assignment)) {
          teamPostHistory[assignment].add(postKey);
        }
      });
    });

    const teamPostAtTime: { [time: string]: { [team: string]: string } } = {};
    times.forEach(time => {
      teamPostAtTime[time] = {};
      posts.forEach(postKey => {
        const assignment = updatedAssignments[time]?.[postKey];
        if (assignment && assignment !== "" && assignment !== "Unassigned" && staffTeams.includes(assignment)) {
          teamPostAtTime[time][assignment] = postKey;
        }
      });
    });

    // Preserve the original chronological order from `event.postingTimes`.
    // Sorting lexicographically breaks overnight ranges (e.g. "23:00","00:00").
    const sortedTimes = [...times];

    sortedTimes.forEach((time, timeIndex) => {
      const currentlyAssigned = new Set<string>();
      const currentAssignmentsByTeam: { [team: string]: string } = {};

      posts.forEach(postKey => {
        const assignment = updatedAssignments[time][postKey];
        if (assignment && assignment !== "" && assignment !== "Unassigned") {
          currentlyAssigned.add(assignment);
          currentAssignmentsByTeam[assignment] = postKey;
        }
      });

      const availableTeams = staffTeams.filter(team => !currentlyAssigned.has(team));
      const unassignedPosts = posts.filter(postKey => {
        const assignment = updatedAssignments[time][postKey];
        return !assignment || assignment === "" || assignment === "Unassigned";
      });

      if (availableTeams.length > 0 && unassignedPosts.length > 0) {
        const postTeamOptions: {
          postKey: string;
          neverBeenHere: string[];
          beenHereButCompletedRotation: string[];
          beenHereButNotAdjacent: string[];
          wouldBeAdjacent: string[];
        }[] = [];

        unassignedPosts.forEach(postKey => {
          const neverBeenHere: string[] = [];
          const beenHereButCompletedRotation: string[] = [];
          const beenHereButNotAdjacent: string[] = [];
          const wouldBeAdjacent: string[] = [];

          availableTeams.forEach(team => {
            const hasBeenHere = teamPostHistory[team].has(postKey);
            const hasCompletedRotation = teamPostHistory[team].size >= posts.length;

            let isAdjacent = false;
            const prevTimeIndex = timeIndex - 1;
            const nextTimeIndex = timeIndex + 1;

            if (prevTimeIndex >= 0) {
              const prevTime = sortedTimes[prevTimeIndex];
              const prevPost = teamPostAtTime[prevTime]?.[team];
              if (prevPost === postKey) {
                isAdjacent = true;
              }
            }

            if (nextTimeIndex < sortedTimes.length) {
              const nextTime = sortedTimes[nextTimeIndex];
              const nextPost = teamPostAtTime[nextTime]?.[team];
              if (nextPost === postKey) {
                isAdjacent = true;
              }
            }

            if (!hasBeenHere) {
              if (isAdjacent) {
                wouldBeAdjacent.push(team);
              } else {
                neverBeenHere.push(team);
              }
            } else if (hasCompletedRotation) {
              if (isAdjacent) {
                wouldBeAdjacent.push(team);
              } else {
                beenHereButCompletedRotation.push(team);
              }
            } else {
              if (isAdjacent) {
                wouldBeAdjacent.push(team);
              } else {
                beenHereButNotAdjacent.push(team);
              }
            }
          });

          postTeamOptions.push({
            postKey,
            neverBeenHere,
            beenHereButCompletedRotation,
            beenHereButNotAdjacent,
            wouldBeAdjacent
          });
        });

        postTeamOptions.sort((a, b) => {
          const aNonAdjacentOptions = a.neverBeenHere.length + a.beenHereButCompletedRotation.length + a.beenHereButNotAdjacent.length;
          const bNonAdjacentOptions = b.neverBeenHere.length + b.beenHereButCompletedRotation.length + b.beenHereButNotAdjacent.length;

          if (aNonAdjacentOptions !== bNonAdjacentOptions) {
            return aNonAdjacentOptions - bNonAdjacentOptions;
          }

          return b.neverBeenHere.length - a.neverBeenHere.length;
        });

        const usedTeams = new Set<string>();

        postTeamOptions.forEach(({ postKey, neverBeenHere, beenHereButCompletedRotation, beenHereButNotAdjacent, wouldBeAdjacent }) => {
          let assignedTeam: string | null = null;

          const availableNeverBeen = neverBeenHere.filter(team => !usedTeams.has(team));
          if (availableNeverBeen.length > 0) {
            assignedTeam = availableNeverBeen[0];
          }

          if (!assignedTeam) {
            const availableCompletedRotation = beenHereButCompletedRotation.filter(team => !usedTeams.has(team));
            if (availableCompletedRotation.length > 0) {
              assignedTeam = availableCompletedRotation[0];
            }
          }

          if (!assignedTeam) {
            const availableNotAdjacent = beenHereButNotAdjacent.filter(team => !usedTeams.has(team));
            if (availableNotAdjacent.length > 0) {
              assignedTeam = availableNotAdjacent[0];
            }
          }

          if (!assignedTeam) {
            const availableAdjacent = wouldBeAdjacent.filter(team => !usedTeams.has(team));
            if (availableAdjacent.length > 0) {
              assignedTeam = availableAdjacent[0];
            }
          }

          if (assignedTeam) {
            updatedAssignments[time][postKey] = assignedTeam;
            usedTeams.add(assignedTeam);
            teamPostHistory[assignedTeam].add(postKey);
            teamPostAtTime[time][assignedTeam] = postKey;
          }
        });
      }
    });
  }

  return updatedAssignments;
}
