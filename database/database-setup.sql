IF (SCHEMA_ID('CallForDataSpeakers') IS NULL)
    EXEC('CREATE SCHEMA CallForDataSpeakers;');


GO
GRANT EXECUTE, SELECT ON SCHEMA::CallForDataSpeakers TO CallForDataSpeakers;


GO
IF (OBJECT_ID('CallForDataSpeakers.Campaigns') IS NULL)
    CREATE TABLE CallForDataSpeakers.Campaigns (
        Token           uniqueidentifier NOT NULL,
        [Name]          nvarchar(200) NOT NULL,
        EventName       nvarchar(400) NOT NULL,
        Email           nvarchar(400) NOT NULL,
        Regions         nvarchar(200) NOT NULL,
        Venue           nvarchar(1000) NOT NULL,
        [Date]          date NOT NULL,
        [URL]           nvarchar(1000) NOT NULL,
        Information     nvarchar(max) NULL,
        Created         datetime2(3) NOT NULL,
        [Sent]          datetime2(3) NULL,
        CONSTRAINT PK_Campaigns PRIMARY KEY CLUSTERED (Token)
    );



GO
CREATE OR ALTER PROCEDURE CallForDataSpeakers.Insert_Campaign
    @Name           nvarchar(200),
    @Email          nvarchar(400),
    @EventName      nvarchar(400),
    @Regions        nvarchar(200),
    @Venue          nvarchar(1000),
    @Date           date,
    @URL            nvarchar(1000),
    @Information    nvarchar(max)
AS

INSERT INTO CallForDataSpeakers.Campaigns (Token, [Name], EventName, Email, Regions, Venue, [Date], [URL], Information, Created)
OUTPUT inserted.Token
SELECT NEWID() AS Token, @Name, @EventName, @Email, @Regions, @Venue, @Date, @URL, @Information, SYSDATETIME() AS Created;

GO
CREATE OR ALTER PROCEDURE CallForDataSpeakers.Approve_Campaign
    @Token          uniqueidentifier
AS

UPDATE CallForDataSpeakers.Campaigns
SET [Sent]=SYSDATETIME()
OUTPUT inserted.[Name], inserted.EventName, inserted.Email, inserted.Regions, inserted.Venue, inserted.[Date], inserted.[URL], inserted.Information
WHERE Token=@Token
  AND [Sent] IS NULL;

GO
CREATE OR ALTER VIEW CallForDataSpeakers.Feed
AS

SELECT EventName, Regions, Email, Venue, [Date], [URL], Information, Created
FROM CallForDataSpeakers.Campaigns
WHERE [Date]>DATEADD(day, -90, SYSDATETIME())
  AND [Sent] IS NOT NULL;

GO
