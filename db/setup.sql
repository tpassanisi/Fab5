-- Fab5 Database Setup
-- Run: mysql -u root -p < db/setup.sql

CREATE DATABASE IF NOT EXISTS fab5;
USE fab5;

-- Players table — tracks returning players by their stored ID
CREATE TABLE IF NOT EXISTS players (
  id VARCHAR(20) PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Player stats — overall win/loss record per player
CREATE TABLE IF NOT EXISTS player_stats (
  player_id VARCHAR(20) PRIMARY KEY,
  wins INT DEFAULT 0,
  losses INT DEFAULT 0,
  games_played INT DEFAULT 0,
  FOREIGN KEY (player_id) REFERENCES players(id)
);

-- Card stats — global win/loss record for each card across all players
CREATE TABLE IF NOT EXISTS card_stats (
  card_id INT PRIMARY KEY,
  card_name VARCHAR(100) NOT NULL,
  times_played INT DEFAULT 0,
  wins INT DEFAULT 0,
  losses INT DEFAULT 0
);

-- Player card stats — per-player win/loss with each specific card
CREATE TABLE IF NOT EXISTS player_card_stats (
  player_id VARCHAR(20),
  card_id INT,
  times_played INT DEFAULT 0,
  wins INT DEFAULT 0,
  losses INT DEFAULT 0,
  PRIMARY KEY (player_id, card_id),
  FOREIGN KEY (player_id) REFERENCES players(id)
);

-- Match history — log of every round played
CREATE TABLE IF NOT EXISTS match_history (
  id INT AUTO_INCREMENT PRIMARY KEY,
  game_code VARCHAR(10) NOT NULL,
  attacker_id VARCHAR(20),
  defender_id VARCHAR(20),
  attacker_card_id INT,
  defender_card_id INT,
  category VARCHAR(20),
  winner_id VARCHAR(20),
  played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed card_stats with all 132 cards
INSERT IGNORE INTO card_stats (card_id, card_name) VALUES
(1, 'Muhammad Ali'), (2, 'Michael Jordan'), (3, 'Babe Ruth'), (4, 'Wayne Gretzky'),
(5, 'Usain Bolt'), (6, 'Tom Brady'), (7, 'Mike Tyson'), (8, 'Pelé'),
(9, 'LeBron James'), (10, 'Bruce Lee'), (11, 'Bo Jackson'), (12, 'Jim Thorpe'),
(13, 'Albert Einstein'), (14, 'Isaac Newton'), (15, 'Nikola Tesla'), (16, 'Charles Darwin'),
(17, 'Stephen Hawking'), (18, 'Galileo Galilei'), (19, 'Leonardo da Vinci'), (20, 'Neil deGrasse Tyson'),
(21, 'Elon Musk'), (22, 'Alan Turing'),
(23, 'Marlon Brando'), (24, 'Denzel Washington'), (25, 'Leonardo DiCaprio'), (26, 'Morgan Freeman'),
(27, 'Clint Eastwood'), (28, 'Sean Connery'), (29, 'Samuel L. Jackson'), (30, 'Al Pacino'),
(31, 'Idris Elba'), (32, 'Paul Newman'),
(33, 'Elvis Presley'), (34, 'Michael Jackson'), (35, 'Freddie Mercury'), (36, 'John Lennon'),
(37, 'Jimi Hendrix'), (38, 'Frank Sinatra'), (39, 'Prince'), (40, 'Bob Marley'),
(41, 'David Bowie'), (42, 'Johnny Cash'),
(43, 'Abraham Lincoln'), (44, 'Martin Luther King Jr.'), (45, 'Winston Churchill'), (46, 'Julius Caesar'),
(47, 'Alexander the Great'), (48, 'Nelson Mandela'), (49, 'Genghis Khan'), (50, 'Theodore Roosevelt'),
(51, 'Walt Disney'), (52, 'Steve Jobs'), (53, 'Arnold Schwarzenegger'), (54, 'Dwayne Johnson'),
(55, 'James Dean'), (56, 'Pablo Picasso'), (57, 'William Shakespeare'), (58, 'Mahatma Gandhi'),
(59, 'Jackie Chan'), (60, 'Aristotle'),
(61, 'Serena Williams'), (62, 'Kobe Bryant'), (63, 'Tiger Woods'), (64, 'Jackie Robinson'),
(65, 'Joe Louis'), (66, 'Jesse Owens'), (67, 'Simone Biles'), (68, 'Lionel Messi'),
(69, 'Nolan Ryan'), (70, 'Wilt Chamberlain'),
(71, 'Marie Curie'), (72, 'Ada Lovelace'), (73, 'Richard Feynman'), (74, 'Carl Sagan'),
(75, 'Thomas Edison'), (76, 'Katherine Johnson'), (77, 'Louis Pasteur'), (78, 'Archimedes'),
(79, 'Tim Berners-Lee'), (80, 'Jane Goodall'),
(81, 'Meryl Streep'), (82, 'Audrey Hepburn'), (83, 'Robert De Niro'), (84, 'Cate Blanchett'),
(85, 'Jack Nicholson'), (86, 'Viola Davis'), (87, 'Charlie Chaplin'), (88, 'Humphrey Bogart'),
(89, 'Anthony Hopkins'), (90, 'Marilyn Monroe'),
(91, 'Aretha Franklin'), (92, 'Stevie Wonder'), (93, 'Whitney Houston'), (94, 'Ray Charles'),
(95, 'Louis Armstrong'), (96, 'Tupac Shakur'), (97, 'Nina Simone'), (98, 'Miles Davis'),
(99, 'Billie Holiday'), (100, 'Chuck Berry'),
(101, 'Cleopatra'), (102, 'Queen Elizabeth I'), (103, 'Napoleon Bonaparte'), (104, 'Harriet Tubman'),
(105, 'Frederick Douglass'), (106, 'Joan of Arc'), (107, 'Benjamin Franklin'), (108, 'Queen Victoria'),
(109, 'Sitting Bull'), (110, 'George Washington'),
(111, 'Frida Kahlo'), (112, 'Coco Chanel'), (113, 'Mark Twain'), (114, 'Oprah Winfrey'),
(115, 'Nikola Jokić'), (116, 'Maya Angelou'), (117, 'Andy Warhol'), (118, 'Amelia Earhart'),
(119, 'Houdini'), (120, 'Bob Ross'),
(121, 'Al Capone'), (122, 'Blackbeard'), (123, 'Rasputin'), (124, 'Vlad the Impaler'),
(125, 'Caligula'), (126, 'Bonnie & Clyde'), (127, 'Billy the Kid'), (128, 'Jesse James'),
(129, 'Nero'), (130, 'Attila the Hun'), (131, 'Mata Hari'), (132, 'D.B. Cooper');
