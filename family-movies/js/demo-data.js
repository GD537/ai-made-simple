/*
 * Demo data: a small film list and a sample family, so the app works before a
 * TMDB key is added. Ratings, scores and keywords are approximate and only for
 * trying the app out. IDs are TMDB IDs so real data can replace them later.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FMDemo = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const AU_LEVEL = { G: 0, PG: 1, M: 2, 'MA15+': 3, 'R18+': 4 };

  // [id, title, year, genres, AU rating, score /10, votes (thousands), runtime, director, cast, keywords]
  const ROWS = [
    [862, 'Toy Story', 1995, 'Animation|Adventure|Family|Comedy', 'G', 8.0, 18, 81, 'John Lasseter', 'Tom Hanks|Tim Allen', 'toy|friendship|pixar'],
    [12, 'Finding Nemo', 2003, 'Animation|Family|Adventure', 'G', 7.8, 19, 100, 'Andrew Stanton', 'Albert Brooks|Ellen DeGeneres', 'ocean|father son relationship|pixar'],
    [14160, 'Up', 2009, 'Animation|Comedy|Family|Adventure', 'PG', 7.9, 20, 96, 'Pete Docter', 'Ed Asner|Jordan Nagai', 'balloon|old man|pixar'],
    [10681, 'WALL·E', 2008, 'Animation|Family|Science Fiction', 'G', 8.1, 19, 98, 'Andrew Stanton', 'Ben Burtt|Elissa Knight', 'robot|space|pixar'],
    [150540, 'Inside Out', 2015, 'Animation|Family|Adventure|Drama|Comedy', 'PG', 7.9, 21, 95, 'Pete Docter', 'Amy Poehler|Phyllis Smith', 'emotions|growing up|pixar'],
    [354912, 'Coco', 2017, 'Family|Animation|Fantasy|Music|Comedy|Adventure', 'PG', 8.2, 19, 105, 'Lee Unkrich', 'Anthony Gonzalez|Gael García Bernal', 'music|day of the dead|pixar'],
    [277834, 'Moana', 2016, 'Adventure|Comedy|Family|Animation', 'PG', 7.6, 12, 107, 'Ron Clements', 'Auliʻi Cravalho|Dwayne Johnson', 'ocean|island|musical|disney'],
    [109445, 'Frozen', 2013, 'Animation|Family|Adventure|Fantasy', 'PG', 7.2, 16, 102, 'Chris Buck', 'Kristen Bell|Idina Menzel', 'sister|snow|musical|disney'],
    [324857, 'Spider-Man: Into the Spider-Verse', 2018, 'Action|Adventure|Animation|Science Fiction', 'PG', 8.4, 15, 117, 'Bob Persichetti', 'Shameik Moore|Hailee Steinfeld', 'superhero|multiverse|teenager'],
    [105, 'Back to the Future', 1985, 'Adventure|Comedy|Science Fiction', 'PG', 8.3, 19, 116, 'Robert Zemeckis', 'Michael J. Fox|Christopher Lloyd', 'time travel|teenager'],
    [329, 'Jurassic Park', 1993, 'Adventure|Science Fiction', 'M', 7.9, 16, 127, 'Steven Spielberg', 'Sam Neill|Laura Dern', 'dinosaur|theme park'],
    [286217, 'The Martian', 2015, 'Drama|Adventure|Science Fiction', 'M', 7.7, 19, 141, 'Ridley Scott', 'Matt Damon|Jessica Chastain', 'mars|survival|space'],
    [76341, 'Mad Max: Fury Road', 2015, 'Action|Adventure|Science Fiction', 'MA15+', 7.6, 22, 121, 'George Miller', 'Tom Hardy|Charlize Theron', 'post-apocalyptic|chase'],
    [27205, 'Inception', 2010, 'Action|Science Fiction|Adventure', 'M', 8.4, 36, 148, 'Christopher Nolan', 'Leonardo DiCaprio|Joseph Gordon-Levitt', 'dream|heist'],
    [329865, 'Arrival', 2016, 'Drama|Science Fiction|Mystery', 'M', 7.6, 17, 116, 'Denis Villeneuve', 'Amy Adams|Jeremy Renner', 'alien|language'],
    [546554, 'Knives Out', 2019, 'Comedy|Crime|Mystery', 'M', 7.8, 13, 131, 'Rian Johnson', 'Daniel Craig|Ana de Armas', 'whodunit|detective'],
    [346648, 'Paddington 2', 2017, 'Adventure|Comedy|Family', 'G', 7.5, 3, 103, 'Paul King', 'Ben Whishaw|Hugh Grant', 'bear|london'],
    [11631, 'Mamma Mia!', 2008, 'Comedy|Romance|Music', 'PG', 6.9, 7, 108, 'Phyllida Lloyd', 'Meryl Streep|Amanda Seyfried', 'musical|wedding|greece'],
    [381284, 'Hidden Figures', 2016, 'Drama|History', 'PG', 8.0, 9, 127, 'Theodore Melfi', 'Taraji P. Henson|Octavia Spencer', 'nasa|true story'],
    [2493, 'The Princess Bride', 1987, 'Adventure|Family|Fantasy|Comedy|Romance', 'PG', 7.7, 5, 98, 'Rob Reiner', 'Cary Elwes|Robin Wright', 'fairy tale|swordplay'],
    [601, 'E.T. the Extra-Terrestrial', 1982, 'Science Fiction|Adventure|Family|Fantasy', 'PG', 7.5, 11, 115, 'Steven Spielberg', 'Henry Thomas|Drew Barrymore', 'alien|friendship'],
    [926, 'Galaxy Quest', 1999, 'Comedy|Family|Science Fiction', 'PG', 7.0, 2, 102, 'Dean Parisot', 'Tim Allen|Sigourney Weaver', 'spoof|space'],
    [44826, 'Hugo', 2011, 'Adventure|Drama|Family', 'PG', 7.1, 6, 126, 'Martin Scorsese', 'Asa Butterfield|Ben Kingsley', 'paris|orphan|cinema'],
    [4348, 'Pride & Prejudice', 2005, 'Drama|Romance', 'PG', 8.1, 8, 129, 'Joe Wright', 'Keira Knightley|Matthew Macfadyen', 'based on novel or book|period drama'],
    [509, 'Notting Hill', 1999, 'Romance|Comedy|Drama', 'M', 7.2, 5, 124, 'Roger Michell', 'Julia Roberts|Hugh Grant', 'london|celebrity'],
    [137106, 'The Lego Movie', 2014, 'Adventure|Animation|Comedy|Family|Fantasy', 'PG', 7.4, 7, 100, 'Phil Lord', 'Chris Pratt|Elizabeth Banks', 'lego|chosen one'],
    [335797, 'Sing', 2016, 'Animation|Comedy|Family|Music', 'PG', 7.1, 7, 108, 'Garth Jennings', 'Matthew McConaughey|Reese Witherspoon', 'singing competition|musical'],
    [2062, 'Ratatouille', 2007, 'Animation|Comedy|Family|Fantasy', 'G', 7.8, 16, 111, 'Brad Bird', 'Patton Oswalt|Lou Romano', 'cooking|paris|pixar'],
    [808, 'Shrek', 2001, 'Animation|Comedy|Fantasy|Adventure|Family', 'PG', 7.7, 17, 90, 'Andrew Adamson', 'Mike Myers|Eddie Murphy', 'ogre|fairy tale'],
    [269149, 'Zootopia', 2016, 'Animation|Adventure|Family|Comedy', 'PG', 7.7, 16, 108, 'Byron Howard', 'Ginnifer Goodwin|Jason Bateman', 'police|detective|disney'],
    [568124, 'Encanto', 2021, 'Animation|Comedy|Family|Fantasy', 'PG', 7.6, 9, 102, 'Jared Bush', 'Stephanie Beatriz|John Leguizamo', 'magic|family|musical|disney'],
    [9806, 'The Incredibles', 2004, 'Action|Adventure|Animation|Family', 'PG', 7.7, 17, 115, 'Brad Bird', 'Craig T. Nelson|Holly Hunter', 'superhero|family|pixar'],
    [85, 'Raiders of the Lost Ark', 1981, 'Adventure|Action', 'M', 7.9, 12, 115, 'Steven Spielberg', 'Harrison Ford|Karen Allen', 'archaeologist|treasure'],
    [771, 'Home Alone', 1990, 'Comedy|Family', 'PG', 7.4, 11, 103, 'Chris Columbus', 'Macaulay Culkin|Joe Pesci', 'christmas|burglar'],
    [671, "Harry Potter and the Philosopher's Stone", 2001, 'Adventure|Fantasy', 'PG', 7.9, 28, 152, 'Chris Columbus', 'Daniel Radcliffe|Rupert Grint', 'magic|school|wizard'],
    [10191, 'How to Train Your Dragon', 2010, 'Fantasy|Adventure|Animation|Family', 'PG', 7.8, 13, 98, 'Chris Sanders', 'Jay Baruchel|Gerard Butler', 'dragon|vikings'],
    [9502, 'Kung Fu Panda', 2008, 'Action|Adventure|Animation|Family|Comedy', 'PG', 7.3, 11, 90, 'Mark Osborne', 'Jack Black|Angelina Jolie', 'kung fu|panda'],
    [20352, 'Despicable Me', 2010, 'Family|Animation|Comedy', 'PG', 7.2, 15, 95, 'Pierre Coffin', 'Steve Carell|Jason Segel', 'villain|minions'],
    [38757, 'Tangled', 2010, 'Animation|Family|Adventure', 'PG', 7.6, 12, 100, 'Nathan Greno', 'Mandy Moore|Zachary Levi', 'princess|tower|musical|disney'],
    [508943, 'Luca', 2021, 'Animation|Comedy|Fantasy|Adventure|Family', 'PG', 7.8, 7, 95, 'Enrico Casarosa', 'Jacob Tremblay|Jack Dylan Grazer', 'sea monster|italy|friendship|pixar'],
    [508442, 'Soul', 2020, 'Animation|Family|Comedy|Fantasy|Drama', 'PG', 8.1, 10, 101, 'Pete Docter', 'Jamie Foxx|Tina Fey', 'jazz|afterlife|pixar'],
    [508947, 'Turning Red', 2022, 'Animation|Family|Comedy|Fantasy', 'PG', 7.4, 5, 100, 'Domee Shi', 'Rosalie Chiang|Sandra Oh', 'growing up|panda|pixar'],
    [118340, 'Guardians of the Galaxy', 2014, 'Action|Science Fiction|Adventure', 'M', 7.9, 27, 121, 'James Gunn', 'Chris Pratt|Zoe Saldaña', 'superhero|space'],
    [284054, 'Black Panther', 2018, 'Action|Adventure|Science Fiction', 'M', 7.4, 22, 135, 'Ryan Coogler', 'Chadwick Boseman|Michael B. Jordan', 'superhero|africa'],
    [245891, 'John Wick', 2014, 'Action|Thriller', 'MA15+', 7.4, 18, 101, 'Chad Stahelski', 'Keanu Reeves|Michael Nyqvist', 'hitman|revenge'],
    [496243, 'Parasite', 2019, 'Comedy|Thriller|Drama', 'MA15+', 8.5, 17, 133, 'Bong Joon-ho', 'Song Kang-ho|Lee Sun-kyun', 'class differences|con artist'],
    [313369, 'La La Land', 2016, 'Comedy|Drama|Romance|Music', 'M', 7.9, 16, 128, 'Damien Chazelle', 'Ryan Gosling|Emma Stone', 'jazz|los angeles|musical'],
    [120467, 'The Grand Budapest Hotel', 2014, 'Comedy|Drama', 'M', 8.0, 14, 100, 'Wes Anderson', 'Ralph Fiennes|Tony Revolori', 'hotel|caper'],
    [455207, 'Crazy Rich Asians', 2018, 'Comedy|Romance|Drama', 'PG', 6.8, 5, 120, 'Jon M. Chu', 'Constance Wu|Henry Golding', 'singapore|wedding'],
    [361743, 'Top Gun: Maverick', 2022, 'Action|Drama', 'M', 8.2, 9, 131, 'Joseph Kosinski', 'Tom Cruise|Miles Teller', 'fighter pilot|sequel'],
    [545611, 'Everything Everywhere All at Once', 2022, 'Action|Adventure|Science Fiction', 'MA15+', 7.8, 6, 140, 'Daniel Kwan', 'Michelle Yeoh|Ke Huy Quan', 'multiverse|mother daughter relationship'],
    [438631, 'Dune', 2021, 'Science Fiction|Adventure', 'M', 7.8, 12, 155, 'Denis Villeneuve', 'Timothée Chalamet|Rebecca Ferguson', 'desert|based on novel or book'],
    [872585, 'Oppenheimer', 2023, 'Drama|History', 'MA15+', 8.1, 9, 180, 'Christopher Nolan', 'Cillian Murphy|Emily Blunt', 'atomic bomb|true story'],
    [346698, 'Barbie', 2023, 'Comedy|Adventure', 'PG', 7.0, 9, 114, 'Greta Gerwig', 'Margot Robbie|Ryan Gosling', 'doll|satire'],
    [788, 'Mrs. Doubtfire', 1993, 'Comedy|Drama|Family', 'PG', 7.1, 7, 125, 'Chris Columbus', 'Robin Williams|Sally Field', 'divorce|disguise'],
    [1584, 'School of Rock', 2003, 'Comedy|Music|Family', 'PG', 7.1, 5, 109, 'Richard Linklater', 'Jack Black|Joan Cusack', 'rock music|teacher'],
    [1593, 'Night at the Museum', 2006, 'Action|Adventure|Comedy|Family|Fantasy', 'PG', 6.6, 11, 108, 'Shawn Levy', 'Ben Stiller|Robin Williams', 'museum|night'],
    [331482, 'Little Women', 2019, 'Drama|Romance', 'PG', 7.9, 7, 135, 'Greta Gerwig', 'Saoirse Ronan|Emma Watson', 'sisters|based on novel or book|period drama'],
    [419430, 'Get Out', 2017, 'Mystery|Thriller|Horror', 'MA15+', 7.6, 17, 104, 'Jordan Peele', 'Daniel Kaluuya|Allison Williams', 'hypnosis|racism'],
    [447332, 'A Quiet Place', 2018, 'Horror|Drama|Science Fiction', 'M', 7.4, 14, 91, 'John Krasinski', 'Emily Blunt|John Krasinski', 'alien|silence|family'],
    [501929, 'The Mitchells vs. the Machines', 2021, 'Animation|Adventure|Comedy|Family|Science Fiction', 'PG', 8.0, 3, 114, 'Mike Rianda', 'Abbi Jacobson|Danny McBride', 'road trip|robot|family'],
    [787699, 'Wonka', 2023, 'Comedy|Family|Fantasy', 'PG', 7.1, 4, 116, 'Paul King', 'Timothée Chalamet|Calah Lane', 'chocolate|musical'],
    [11, 'Star Wars', 1977, 'Adventure|Action|Science Fiction', 'PG', 8.2, 21, 121, 'George Lucas', 'Mark Hamill|Harrison Ford', 'space opera|rebellion'],
    [603, 'The Matrix', 1999, 'Action|Science Fiction', 'MA15+', 8.2, 26, 136, 'Lana Wachowski', 'Keanu Reeves|Laurence Fishburne', 'simulated reality|hacker'],
    [157336, 'Interstellar', 2014, 'Adventure|Drama|Science Fiction', 'M', 8.4, 36, 169, 'Christopher Nolan', 'Matthew McConaughey|Anne Hathaway', 'space travel|black hole'],
    [155, 'The Dark Knight', 2008, 'Drama|Action|Crime|Thriller', 'M', 8.5, 33, 152, 'Christopher Nolan', 'Christian Bale|Heath Ledger', 'superhero|joker'],
    [350, 'The Devil Wears Prada', 2006, 'Comedy|Drama|Romance', 'PG', 7.4, 12, 109, 'David Frankel', 'Meryl Streep|Anne Hathaway', 'fashion|new york'],
  ];

  function bayes(avg, votes) {
    const m = 200;
    const c = 6.5;
    return ((votes / (votes + m)) * avg + (m / (votes + m)) * c) / 10;
  }

  const MOVIES = ROWS.map((r) => ({
    id: r[0],
    title: r[1],
    year: r[2],
    genres: r[3].split('|'),
    cert: r[4],
    certCountry: 'AU',
    ratingLevel: AU_LEVEL[r[4]],
    quality: bayes(r[5], r[6] * 1000),
    votes: r[6] * 1000,
    runtime: r[7],
    directors: [r[8]],
    cast: r[9].split('|'),
    keywords: r[10].split('|'),
    poster: null,
    providers: null,
    demo: true,
  }));

  const MOVIES_BY_ID = {};
  MOVIES.forEach((m) => { MOVIES_BY_ID[m.id] = m; });

  const MEMBERS = [
    { id: 'demo-mum', name: 'Mum', emoji: '👩', isChild: false, maxRating: 3, tasteHalfLifeDays: 365, rewatchHalfLifeDays: 180 },
    { id: 'demo-dad', name: 'Dad', emoji: '👨', isChild: false, maxRating: 4, tasteHalfLifeDays: 365, rewatchHalfLifeDays: 180 },
    { id: 'demo-kid1', name: 'Sam (10)', emoji: '🧒', isChild: true, maxRating: 1, tasteHalfLifeDays: 180, rewatchHalfLifeDays: 45 },
    { id: 'demo-kid2', name: 'Ruby (6)', emoji: '👧', isChild: true, maxRating: 1, tasteHalfLifeDays: 120, rewatchHalfLifeDays: 21 },
  ];

  // [member, movie, days ago (null = unknown), completion, thumbs, together]
  const HISTORY = [
    ['demo-mum', 11631, 400, 1, 1, false],
    ['demo-mum', 509, 90, 1, null, false],
    ['demo-mum', 381284, 30, 1, 1, false],
    ['demo-mum', 2493, 700, 1, 1, false],
    ['demo-mum', 4348, 250, 1, 1, false],
    ['demo-mum', 313369, 150, 1, null, true],
    ['demo-mum', 455207, 60, 1, 0, false],
    ['demo-dad', 76341, 15, 1, 1, false],
    ['demo-dad', 286217, 120, 1, null, false],
    ['demo-dad', 329, 500, 1, 1, false],
    ['demo-dad', 11631, 400, 0.25, null, false],
    ['demo-dad', 155, 300, 1, 1, false],
    ['demo-dad', 245891, 200, 1, null, false],
    ['demo-dad', 11, null, null, 1, false],
    ['demo-dad', 85, null, null, 1, false],
    ['demo-dad', 313369, 150, 1, -1, true],
    ['demo-kid1', 324857, 20, 1, 1, false],
    ['demo-kid1', 277834, 200, 1, null, true],
    ['demo-kid1', 109445, 150, 0.2, null, false],
    ['demo-kid1', 105, 60, 1, 1, false],
    ['demo-kid1', 9806, 400, 1, 1, false],
    ['demo-kid1', 671, 90, 1, 1, false],
    ['demo-kid1', 10191, 300, 1, null, false],
    ['demo-kid2', 862, 10, 1, 1, false],
    ['demo-kid2', 862, 40, 1, 1, false],
    ['demo-kid2', 109445, 60, 1, 1, false],
    ['demo-kid2', 109445, 20, 1, null, false],
    ['demo-kid2', 346648, 100, 1, null, true],
    ['demo-kid2', 277834, 200, 1, 1, true],
    ['demo-kid2', 568124, 25, 1, 1, false],
    ['demo-mum', 277834, 200, 1, null, true],
    ['demo-mum', 346648, 100, 1, null, true],
    ['demo-dad', 346648, 100, 1, null, true],
    ['demo-kid1', 346648, 100, 1, null, true],
    ['demo-mum', 771, 270, 1, 1, true],
    ['demo-dad', 771, 270, 1, 1, true],
    ['demo-kid1', 771, 270, 1, 1, true],
    ['demo-kid2', 771, 270, 1, 0, true],
  ];

  function shift(today, days) {
    const t = Date.parse(today + 'T00:00:00Z') - days * 86400000;
    return new Date(t).toISOString().slice(0, 10);
  }

  // Builds the demo family's data with dates relative to `today`.
  function buildDemoState(today) {
    let n = 0;
    const history = HISTORY.map((h) => {
      const watchedOn = h[2] == null ? null : shift(today, h[2]);
      return {
        id: 'demo-h' + ++n,
        memberId: h[0],
        movieId: h[1],
        watchedOn,
        signalDate: watchedOn || shift(today, 365),
        completion: h[3],
        thumbs: h[4],
        together: h[5],
        owned: false,
        source: 'demo',
      };
    });
    return {
      members: MEMBERS.map((m) => Object.assign({}, m)),
      history,
      watchlist: [
        { memberId: 'demo-mum', movieId: 331482, addedOn: shift(today, 12) },
        { memberId: 'demo-dad', movieId: 361743, addedOn: shift(today, 5) },
      ],
      dismissed: [],
      events: [],
    };
  }

  return { MOVIES, MOVIES_BY_ID, buildDemoState };
});
