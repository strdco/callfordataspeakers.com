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
        EventType       nvarchar(400) NULL,
        Email           nvarchar(400) NOT NULL,
        Regions         nvarchar(200) NOT NULL,
        Venue           nvarchar(1000) NOT NULL,
        [Date]          date NOT NULL,
        EndDate         date NULL,
        [URL]           nvarchar(1000) NOT NULL,
        Information     nvarchar(max) NULL,
        Created         datetime2(3) NOT NULL,
        [Sent]          datetime2(3) NULL,
        Cfs_Closes      datetime2(0) NULL,
        CONSTRAINT PK_Campaigns PRIMARY KEY NONCLUSTERED (Token),
        CONSTRAINT UQ_Campaigns UNIQUE CLUSTERED (EventName, Token)
    );



GO
CREATE OR ALTER PROCEDURE CallForDataSpeakers.Insert_Campaign
    @Name           nvarchar(200),
    @Email          nvarchar(400),
    @EventName      nvarchar(400),
    @EventType      nvarchar(400)=NULL,
    @Regions        nvarchar(200),
    @Venue          nvarchar(1000),
    @Date           date,
    @EndDate        date=NULL,
    @URL            nvarchar(1000),
    @Information    nvarchar(max)
AS

INSERT INTO CallForDataSpeakers.Campaigns (Token, [Name], EventName, EventType, Email, Regions, Venue, [Date], EndDate, [URL], Information, Created)
OUTPUT inserted.Token
SELECT NEWID() AS Token, @Name, @EventName, @EventType, @Email, @Regions, @Venue, @Date, NULLIF(@EndDate, @Date), @URL, ISNULL(@Information, N''), SYSDATETIME() AS Created;

GO
CREATE OR ALTER PROCEDURE CallForDataSpeakers.Approve_Campaign
    @Token          uniqueidentifier
AS

UPDATE CallForDataSpeakers.Campaigns
SET [Sent]=SYSDATETIME()
OUTPUT inserted.[Name], inserted.EventName, inserted.EventType, inserted.Email, inserted.Regions, inserted.Venue, inserted.[Date], inserted.EndDate, inserted.[URL], inserted.Information
WHERE Token=@Token
  AND [Sent] IS NULL;

GO
CREATE OR ALTER PROCEDURE CallForDataSpeakers.Update_CfsClose
    @Token          uniqueidentifier,
    @Cfs_Closes     datetime2(0)
AS

UPDATE CallForDataSpeakers.Campaigns
SET Cfs_Closes=@Cfs_Closes
WHERE Token=@Token;

GO
CREATE OR ALTER VIEW CallForDataSpeakers.Feed
AS

SELECT EventName, EventType, Regions, Email, Venue, [Date], NULLIF(EndDate, [Date]) AS EndDate, [URL], Information, Created, Cfs_Closes
FROM CallForDataSpeakers.Campaigns
WHERE ISNULL(EndDate, [Date])>DATEADD(day, -90, SYSDATETIME())
  AND [Sent] IS NOT NULL;

GO
