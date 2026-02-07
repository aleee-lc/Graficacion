CREATE TABLE `users` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `name` varchar(255),
  `email` varchar(255) UNIQUE,
  `password` varchar(255),
  `user_type` enum('TECH','CLIENT'),
  `created_at` datetime
);

CREATE TABLE `tech_roles` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `name` varchar(255)
);

CREATE TABLE `tech_user_roles` (
  `user_id` int,
  `role_id` int,
  PRIMARY KEY (`user_id`, `role_id`)
);

CREATE TABLE `stakeholder_roles` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `name` varchar(255)
);

CREATE TABLE `stakeholder_profile` (
  `user_id` int PRIMARY KEY,
  `stakeholder_role_id` int,
  `company_name` varchar(255)
);

CREATE TABLE `projects` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `name` varchar(255),
  `description` text,
  `start_date` date,
  `end_date` date
);

CREATE TABLE `project_users` (
  `project_id` int,
  `user_id` int,
  PRIMARY KEY (`project_id`, `user_id`)
);

CREATE TABLE `processes` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `project_id` int,
  `name` varchar(255),
  `description` text
);

CREATE TABLE `subprocesses` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `process_id` int,
  `name` varchar(255),
  `description` text
);

CREATE TABLE `techniques` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `name` varchar(255),
  `description` text
);

CREATE TABLE `subprocess_techniques` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `subprocess_id` int,
  `technique_id` int,
  `tech_user_id` int,
  `scheduled_date` datetime,
  `duration_minutes` int,
  `status` enum('PLANNED','DONE','CANCELLED')
);

CREATE TABLE `technique_stakeholders` (
  `subprocess_technique_id` int,
  `stakeholder_user_id` int,
  PRIMARY KEY (`subprocess_technique_id`, `stakeholder_user_id`)
);

CREATE TABLE `technique_results` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `subprocess_technique_id` int UNIQUE,
  `created_at` datetime
);

CREATE TABLE `survey_results` (
  `id` int PRIMARY KEY,
  `responses` json
);

CREATE TABLE `workshop_observations` (
  `id` int PRIMARY KEY,
  `notes` text
);

CREATE TABLE `interview_results` (
  `id` int PRIMARY KEY,
  `audio_url` varchar(255),
  `transcript` text
);

CREATE TABLE `requirements` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `project_id` int,
  `title` varchar(255),
  `description` text,
  `source` enum('SURVEY','INTERVIEW','WORKSHOP'),
  `status` enum('DRAFT','REVIEW','ACCEPTED','REJECTED')
);

CREATE TABLE `requirement_sources` (
  `requirement_id` int,
  `technique_result_id` int,
  PRIMARY KEY (`requirement_id`, `technique_result_id`)
);

CREATE TABLE `requirement_reviews` (
  `requirement_id` int,
  `product_owner_id` int,
  `approved` boolean,
  `comments` text,
  `reviewed_at` datetime,
  PRIMARY KEY (`requirement_id`, `product_owner_id`)
);

CREATE TABLE `classes` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `project_id` int,
  `name` varchar(255),
  `description` text
);

CREATE TABLE `class_attributes` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `class_id` int,
  `name` varchar(255),
  `data_type` varchar(255)
);

CREATE TABLE `class_methods` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `class_id` int,
  `name` varchar(255),
  `return_type` varchar(255)
);

CREATE TABLE `class_relationships` (
  `id` int PRIMARY KEY AUTO_INCREMENT,
  `source_class_id` int,
  `target_class_id` int,
  `relationship_type` enum('ASSOCIATION','AGGREGATION','COMPOSITION')
);

CREATE TABLE `class_inheritance` (
  `parent_class_id` int,
  `child_class_id` int,
  PRIMARY KEY (`parent_class_id`, `child_class_id`)
);

ALTER TABLE `tech_user_roles` ADD FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);

ALTER TABLE `tech_user_roles` ADD FOREIGN KEY (`role_id`) REFERENCES `tech_roles` (`id`);

ALTER TABLE `stakeholder_profile` ADD FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);

ALTER TABLE `stakeholder_profile` ADD FOREIGN KEY (`stakeholder_role_id`) REFERENCES `stakeholder_roles` (`id`);

ALTER TABLE `project_users` ADD FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`);

ALTER TABLE `project_users` ADD FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);

ALTER TABLE `processes` ADD FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`);

ALTER TABLE `subprocesses` ADD FOREIGN KEY (`process_id`) REFERENCES `processes` (`id`);

ALTER TABLE `subprocess_techniques` ADD FOREIGN KEY (`subprocess_id`) REFERENCES `subprocesses` (`id`);

ALTER TABLE `subprocess_techniques` ADD FOREIGN KEY (`technique_id`) REFERENCES `techniques` (`id`);

ALTER TABLE `subprocess_techniques` ADD FOREIGN KEY (`tech_user_id`) REFERENCES `users` (`id`);

ALTER TABLE `technique_stakeholders` ADD FOREIGN KEY (`subprocess_technique_id`) REFERENCES `subprocess_techniques` (`id`);

ALTER TABLE `technique_stakeholders` ADD FOREIGN KEY (`stakeholder_user_id`) REFERENCES `users` (`id`);

ALTER TABLE `technique_results` ADD FOREIGN KEY (`subprocess_technique_id`) REFERENCES `subprocess_techniques` (`id`);

ALTER TABLE `survey_results` ADD FOREIGN KEY (`id`) REFERENCES `technique_results` (`id`);

ALTER TABLE `workshop_observations` ADD FOREIGN KEY (`id`) REFERENCES `technique_results` (`id`);

ALTER TABLE `interview_results` ADD FOREIGN KEY (`id`) REFERENCES `technique_results` (`id`);

ALTER TABLE `requirements` ADD FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`);

ALTER TABLE `requirement_sources` ADD FOREIGN KEY (`requirement_id`) REFERENCES `requirements` (`id`);

ALTER TABLE `requirement_sources` ADD FOREIGN KEY (`technique_result_id`) REFERENCES `technique_results` (`id`);

ALTER TABLE `requirement_reviews` ADD FOREIGN KEY (`requirement_id`) REFERENCES `requirements` (`id`);

ALTER TABLE `requirement_reviews` ADD FOREIGN KEY (`product_owner_id`) REFERENCES `users` (`id`);

ALTER TABLE `classes` ADD FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`);

ALTER TABLE `class_attributes` ADD FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`);

ALTER TABLE `class_methods` ADD FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`);

ALTER TABLE `class_relationships` ADD FOREIGN KEY (`source_class_id`) REFERENCES `classes` (`id`);

ALTER TABLE `class_relationships` ADD FOREIGN KEY (`target_class_id`) REFERENCES `classes` (`id`);

ALTER TABLE `class_inheritance` ADD FOREIGN KEY (`parent_class_id`) REFERENCES `classes` (`id`);

ALTER TABLE `class_inheritance` ADD FOREIGN KEY (`child_class_id`) REFERENCES `classes` (`id`);
